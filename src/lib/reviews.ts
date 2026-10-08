/* =====================================================================
 * OMDØMME – samlet rating fra flere kilder.
 *   Kilder: Google (Places API New), TripAdvisor (Content API) og våre
 *   egne kunder (ratings-tabellen). Hver ekstern kilde er config-styrt
 *   (env) og cacher 6t, så trafikk aldri hamrer API-ene. Mangler nøkler,
 *   utelates kilden – løsningen funker med det som er satt opp.
 *
 *   Google (finnes fra før):
 *     GOOGLE_PLACES_API_KEY, GOOGLE_PLACES_ID
 *   TripAdvisor (ny):
 *     TRIPADVISOR_API_KEY, TRIPADVISOR_LOCATION_ID
 *     Merk: TripAdvisors Content API krever egen tilgang + at nøkkelen
 *     låses til referer/IP i deres konsoll. Vilkår krever attribusjon
 *     (lenke tilbake) ved offentlig visning.
 * ===================================================================== */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const REVALIDATE = 21600; // 6t

/* ---------------- Konfig (DB med env-fallback) ----------------
 * Nøkler kan settes i /admin/rating (lagres i review_config, kun admin).
 * Server-koden leser dem via service-role (bypasser RLS, aldri klienten).
 * Mangler service-nøkkel eller rad → faller tilbake til env-variablene,
 * så eksisterende oppsett virker uendret. */
export type ReviewConfig = {
  googleKey: string | null;
  googlePlaceId: string | null;
  googleEnabled: boolean;
  taKey: string | null;
  taLoc: string | null;
  taEnabled: boolean;
  tpKey: string | null;
  tpBusinessUnitId: string | null;
  tpEnabled: boolean;
};

function envConfig(): ReviewConfig {
  return {
    googleKey: process.env.GOOGLE_PLACES_API_KEY || null,
    googlePlaceId: process.env.GOOGLE_PLACES_ID || null,
    googleEnabled: true,
    taKey: process.env.TRIPADVISOR_API_KEY || null,
    taLoc: process.env.TRIPADVISOR_LOCATION_ID || null,
    taEnabled: true,
    tpKey: process.env.TRUSTPILOT_API_KEY || null,
    tpBusinessUnitId: process.env.TRUSTPILOT_BUSINESS_UNIT_ID || null,
    tpEnabled: true,
  };
}

async function getReviewConfig(): Promise<ReviewConfig> {
  const env = envConfig();
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("review_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return env;
    const d = data as Record<string, unknown>;
    return {
      googleKey: (d.google_api_key as string) || env.googleKey,
      googlePlaceId: (d.google_place_id as string) || env.googlePlaceId,
      googleEnabled: d.google_enabled !== false,
      taKey: (d.tripadvisor_api_key as string) || env.taKey,
      taLoc: (d.tripadvisor_location_id as string) || env.taLoc,
      taEnabled: d.tripadvisor_enabled !== false,
      tpKey: (d.trustpilot_api_key as string) || env.tpKey,
      tpBusinessUnitId:
        (d.trustpilot_business_unit_id as string) || env.tpBusinessUnitId,
      tpEnabled: d.trustpilot_enabled !== false,
    };
  } catch {
    return env; // ingen service-nøkkel → env-styrt som før
  }
}

export type SourceKey = "internal" | "google" | "tripadvisor" | "trustpilot";

export type ReviewSource = {
  key: SourceKey;
  label: string;
  configured: boolean; // om kilden er satt opp (env/data finnes)
  rating: number; // 0–5
  count: number;
  url: string | null;
};

export type AggregatedReview = {
  source: SourceKey;
  sourceLabel: string;
  author: string;
  rating: number;
  text: string;
  when: string;
  url: string | null;
  /** Profilbilde (Google gir det; ellers null → initial vises). */
  photo?: string | null;
  /** For sortering/fletting (ms), 0 hvis ukjent. */
  ts?: number;
};

export type ReviewsSummary = {
  sources: ReviewSource[];
  blendedRating: number; // antalls-vektet, 0–5
  blendedCount: number;
  recent: AggregatedReview[];
};

export type InternalOverview = {
  rating: number;
  count: number;
  recent: { barber: string; stars: number; text: string; createdAt: string }[];
};

function relTime(iso: string): string {
  try {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return "i dag";
    if (days === 1) return "i går";
    if (days < 7) return `${days} dager siden`;
    const w = Math.floor(days / 7);
    if (w < 5) return w === 1 ? "1 uke siden" : `${w} uker siden`;
    const m = Math.floor(days / 30);
    return m <= 1 ? "1 måned siden" : `${m} måneder siden`;
  } catch {
    return "";
  }
}

/* ---------------- Google (Places API New) ---------------- */
type GooglePlaces = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: Array<{
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  }>;
};

async function googleSource(cfg: ReviewConfig): Promise<{
  source: ReviewSource;
  recent: AggregatedReview[];
} | null> {
  const key = cfg.googleKey;
  const placeId = cfg.googlePlaceId;
  if (!cfg.googleEnabled || !key || !placeId) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=no`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          // Kallet går fra serveren (Vercel), som ikke sender Referer selv.
          // Er nøkkelen låst til «Websites → downtownbarbers.no» i Google
          // Cloud, må vi oppgi domenet her – ellers avvises kallet.
          Referer: "https://downtownbarbers.no/",
          "X-Goog-FieldMask":
            "rating,userRatingCount,googleMapsUri,reviews.rating,reviews.text,reviews.originalText,reviews.relativePublishTimeDescription,reviews.publishTime,reviews.authorAttribution",
        },
        next: { revalidate: REVALIDATE, tags: ["reviews"] },
      },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as GooglePlaces;
    const url = d.googleMapsUri ?? null;
    const recent: AggregatedReview[] = (d.reviews ?? [])
      .map((r) => ({
        source: "google" as const,
        sourceLabel: "Google",
        author: r.authorAttribution?.displayName ?? "Google-bruker",
        rating: r.rating ?? 0,
        // Originalteksten (slik kunden skrev den), ikke Googles oversettelse.
        text: (r.originalText?.text ?? r.text?.text ?? "").trim(),
        when: r.relativePublishTimeDescription ?? "",
        url: r.authorAttribution?.uri ?? url,
        photo: r.authorAttribution?.photoUri ?? null,
        ts: r.publishTime ? Date.parse(r.publishTime) || 0 : 0,
      }))
      .filter((r) => r.text.length > 0);
    return {
      source: {
        key: "google",
        label: "Google",
        configured: true,
        rating: d.rating ?? 0,
        count: d.userRatingCount ?? 0,
        url,
      },
      recent,
    };
  } catch {
    return null;
  }
}

/* ---------------- TripAdvisor (Content API) ---------------- */
type TaDetails = { rating?: string; num_reviews?: string; web_url?: string };
type TaReviews = {
  data?: Array<{
    rating?: number;
    text?: string;
    published_date?: string;
    url?: string;
    user?: { username?: string };
  }>;
};

async function tripadvisorSource(cfg: ReviewConfig): Promise<{
  source: ReviewSource;
  recent: AggregatedReview[];
} | null> {
  const key = cfg.taKey;
  const loc = cfg.taLoc;
  if (!cfg.taEnabled || !key || !loc) return null;
  const base = `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(loc)}`;
  const k = `key=${encodeURIComponent(key)}`;
  // Referer: TripAdvisor-nøkkelen låses til domenet i deres konsoll, og
  // serverkall fra Vercel sender ikke domenet av seg selv.
  const opts = {
    headers: { accept: "application/json", Referer: "https://downtownbarbers.no/" },
    next: { revalidate: REVALIDATE, tags: ["reviews"] },
  };
  try {
    // Reviews-endepunktet filtrerer på språk – hent både norske og engelske.
    const [dRes, rNo, rEn] = await Promise.all([
      fetch(`${base}/details?${k}&language=no`, opts),
      fetch(`${base}/reviews?${k}&language=no`, opts),
      fetch(`${base}/reviews?${k}&language=en`, opts),
    ]);
    if (!dRes.ok) return null;
    const d = (await dRes.json()) as TaDetails;
    const rating = Number(d.rating) || 0;
    const count = Number(d.num_reviews) || 0;
    const url = d.web_url ?? null;

    const rows: NonNullable<TaReviews["data"]> = [];
    for (const res of [rNo, rEn]) {
      if (!res.ok) continue;
      const rv = (await res.json()) as TaReviews;
      rows.push(...(rv.data ?? []));
    }
    const seen = new Set<string>();
    const recent: AggregatedReview[] = rows
      .map((r) => ({
        source: "tripadvisor" as const,
        sourceLabel: "Tripadvisor",
        author: r.user?.username ?? "Tripadvisor-bruker",
        rating: Number(r.rating) || 0,
        text: (r.text ?? "").trim(),
        when: r.published_date ? relTime(r.published_date) : "",
        url: r.url ?? url,
        photo: null,
        ts: r.published_date ? Date.parse(r.published_date) || 0 : 0,
      }))
      .filter((r) => {
        const id = r.author + "|" + r.text.slice(0, 40);
        if (!r.text || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    return {
      source: {
        key: "tripadvisor",
        label: "Tripadvisor",
        configured: true,
        rating,
        count,
        url,
      },
      recent,
    };
  } catch {
    return null;
  }
}

/* ---------------- Trustpilot (Business Units API, public) ----------------
 *   GET /v1/business-units/{id}            -> score.trustScore / score.stars
 *                                             numberOfReviews.total, name.identifying
 *   GET /v1/business-units/{id}/reviews    -> reviews[]{stars,title,text,createdAt,
 *                                             consumer.displayName}
 *   Auth: «apikey»-header. Nøkkel + Business Unit-ID settes i admin → Rating
 *   (eller env). «Se alle»-lenken bygges fra name.identifying (domenet), som
 *   er Trustpilots egen URL-form: trustpilot.com/review/<domene>. */
type TpUnit = {
  displayName?: string;
  name?: { identifying?: string };
  numberOfReviews?: { total?: number };
  score?: { stars?: number; trustScore?: number };
};
type TpReviews = {
  reviews?: Array<{
    stars?: number;
    title?: string;
    text?: string;
    createdAt?: string;
    consumer?: { displayName?: string };
  }>;
};

async function trustpilotSource(cfg: ReviewConfig): Promise<{
  source: ReviewSource;
  recent: AggregatedReview[];
} | null> {
  const key = cfg.tpKey;
  const unit = cfg.tpBusinessUnitId;
  if (!cfg.tpEnabled || !key || !unit) return null;
  const base = `https://api.trustpilot.com/v1/business-units/${encodeURIComponent(unit)}`;
  const opts = {
    headers: { apikey: key, accept: "application/json" },
    next: { revalidate: REVALIDATE, tags: ["reviews"] },
  };
  try {
    const [uRes, rRes] = await Promise.all([
      fetch(base, opts),
      fetch(`${base}/reviews?orderBy=createdat.desc&perPage=20`, opts),
    ]);
    if (!uRes.ok) return null;
    const u = (await uRes.json()) as TpUnit;
    const rating = u.score?.stars ?? u.score?.trustScore ?? 0;
    const count = u.numberOfReviews?.total ?? 0;
    const domain = u.name?.identifying ?? null;
    const url = domain ? `https://www.trustpilot.com/review/${domain}` : null;

    let recent: AggregatedReview[] = [];
    if (rRes.ok) {
      const rv = (await rRes.json()) as TpReviews;
      recent = (rv.reviews ?? [])
        .map((r) => ({
          source: "trustpilot" as const,
          sourceLabel: "Trustpilot",
          author: r.consumer?.displayName ?? "Trustpilot-bruker",
          rating: Number(r.stars) || 0,
          text: (r.text ?? r.title ?? "").trim(),
          when: r.createdAt ? relTime(r.createdAt) : "",
          url,
          photo: null,
          ts: r.createdAt ? Date.parse(r.createdAt) || 0 : 0,
        }))
        .filter((r) => r.text.length > 0)
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    }
    return {
      source: {
        key: "trustpilot",
        label: "Trustpilot",
        configured: true,
        rating,
        count,
        url,
      },
      recent,
    };
  } catch {
    return null;
  }
}

/* ---------------- Samlet ---------------- */
export async function getReviewsSummary(
  internal: InternalOverview,
): Promise<ReviewsSummary> {
  const cfg = await getReviewConfig();
  const [google, tripadvisor, trustpilot] = await Promise.all([
    googleSource(cfg),
    tripadvisorSource(cfg),
    trustpilotSource(cfg),
  ]);

  const internalSource: ReviewSource = {
    key: "internal",
    label: "Egne kunder",
    configured: true,
    rating: internal.rating,
    count: internal.count,
    url: null,
  };

  const sources: ReviewSource[] = [internalSource];
  const recent: AggregatedReview[] = [];

  // Egne kunder → aggregerte anmeldelser
  for (const c of internal.recent) {
    recent.push({
      source: "internal",
      sourceLabel: "Egen kunde",
      author: `Kunde · ${c.barber}`,
      rating: c.stars,
      text: c.text,
      when: relTime(c.createdAt),
      url: null,
    });
  }

  if (google) {
    sources.push(google.source);
    recent.push(...google.recent);
  }
  if (tripadvisor) {
    sources.push(tripadvisor.source);
    recent.push(...tripadvisor.recent);
  }
  if (trustpilot) {
    sources.push(trustpilot.source);
    recent.push(...trustpilot.recent);
  }

  // Antalls-vektet snitt over kilder som faktisk har vurderinger.
  let wSum = 0;
  let nSum = 0;
  for (const s of sources) {
    if (s.count > 0) {
      wSum += s.rating * s.count;
      nSum += s.count;
    }
  }

  return {
    sources,
    blendedRating: nSum > 0 ? wSum / nSum : 0,
    blendedCount: nSum,
    recent: recent.slice(0, 9),
  };
}

/* ---------------- Egne kunder (offentlig aggregat) ----------------
 * Anonyme besøkende kan ikke lese ratings-tabellen (RLS admin/shop).
 * public_rating_summary() (migrasjon 0024) gir kun snitt + antall.
 * Mangler funksjonen (ikke kjørt enda), utelates kilden – forsiden
 * blander da bare Google + TripAdvisor. */
async function internalPublicSource(): Promise<ReviewSource | null> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("public_rating_summary");
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    const count = Number(row?.cnt) || 0;
    if (count <= 0) return null;
    return {
      key: "internal",
      label: "Egne kunder",
      configured: true,
      rating: Number(row?.avg) || 0,
      count,
      url: null,
    };
  } catch {
    return null;
  }
}

/** Offentlig omdømme til forsiden: blander egne kunder (aggregat via RPC),
 *  Google og TripAdvisor. Viser IKKE enkeltkunders kommentartekst offentlig –
 *  kun eksterne (Google/TripAdvisor) anmeldelser tas med i `recent`. */
export async function getPublicReviewsSummary(): Promise<ReviewsSummary> {
  const cfg = await getReviewConfig();
  const [internal, google, tripadvisor, trustpilot] = await Promise.all([
    internalPublicSource(),
    googleSource(cfg),
    tripadvisorSource(cfg),
    trustpilotSource(cfg),
  ]);

  const sources: ReviewSource[] = [];
  if (internal) sources.push(internal);
  if (google) sources.push(google.source);
  if (tripadvisor) sources.push(tripadvisor.source);
  if (trustpilot) sources.push(trustpilot.source);
  // Flett de eksterne kildene (G, T, TP, G, T, TP …) så alle synes.
  // Kun gode anmeldelser (4–5 stjerner) med litt tekst på forsiden. Terskelen
  // er lav (minst 8 tegn) så flest mulig anmeldelser kommer med og karusellen
  // får nok kort til å bla i.
  const good = (list: AggregatedReview[]) =>
    list.filter((r) => r.rating >= 4 && r.text.length >= 8);
  const lists = [
    good(google?.recent ?? []),
    good(tripadvisor?.recent ?? []),
    good(trustpilot?.recent ?? []),
  ];
  const recent: AggregatedReview[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const l of lists) if (l[i]) recent.push(l[i]);
  }

  let wSum = 0;
  let nSum = 0;
  for (const s of sources) {
    if (s.count > 0) {
      wSum += s.rating * s.count;
      nSum += s.count;
    }
  }

  return {
    sources,
    blendedRating: nSum > 0 ? wSum / nSum : 0,
    blendedCount: nSum,
    recent: recent.slice(0, 9),
  };
}

/** Konfig-status til admin-skjemaet. Leser review_config med admin-økta
 *  (RLS: kun admin). Returnerer IKKE selve nøklene – bare om de er satt,
 *  pluss ikke-hemmelige felt (place-ID / location-ID) og av/på. Faller
 *  tilbake til env-verdiene for «er satt»-indikatoren. */
export type ReviewConfigStatus = {
  googlePlaceId: string;
  googleEnabled: boolean;
  googleKeySet: boolean;
  taLocationId: string;
  taEnabled: boolean;
  taKeySet: boolean;
  tpBusinessUnitId: string;
  tpEnabled: boolean;
  tpKeySet: boolean;
};

export async function getReviewConfigAdmin(): Promise<ReviewConfigStatus> {
  const envG = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const envT = Boolean(process.env.TRIPADVISOR_API_KEY);
  const envTp = Boolean(process.env.TRUSTPILOT_API_KEY);
  const fallback: ReviewConfigStatus = {
    googlePlaceId: process.env.GOOGLE_PLACES_ID || "",
    googleEnabled: true,
    googleKeySet: envG,
    taLocationId: process.env.TRIPADVISOR_LOCATION_ID || "",
    taEnabled: true,
    taKeySet: envT,
    tpBusinessUnitId: process.env.TRUSTPILOT_BUSINESS_UNIT_ID || "",
    tpEnabled: true,
    tpKeySet: envTp,
  };
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("review_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return fallback;
    const d = data as Record<string, unknown>;
    return {
      googlePlaceId: (d.google_place_id as string) || fallback.googlePlaceId,
      googleEnabled: d.google_enabled !== false,
      googleKeySet: Boolean(d.google_api_key) || envG,
      taLocationId: (d.tripadvisor_location_id as string) || fallback.taLocationId,
      taEnabled: d.tripadvisor_enabled !== false,
      taKeySet: Boolean(d.tripadvisor_api_key) || envT,
      tpBusinessUnitId:
        (d.trustpilot_business_unit_id as string) || fallback.tpBusinessUnitId,
      tpEnabled: d.trustpilot_enabled !== false,
      tpKeySet: Boolean(d.trustpilot_api_key) || envTp,
    };
  } catch {
    return fallback;
  }
}


/* ---------------- Diagnose (admin → «Test kobling») ---------------- */
export type SourceTest = { ok: boolean; message: string };
export type ReviewConnectionTest = {
  config: SourceTest;
  google: SourceTest;
  tripadvisor: SourceTest;
  trustpilot: SourceTest;
};

/** Ufiltrert, ubufret test av kildene, med Googles/TripAdvisors egen
 *  feilmelding – så admin ser NØYAKTIG hvorfor noe ikke vises. */
export async function testReviewConnections(): Promise<ReviewConnectionTest> {
  let config: SourceTest;
  let cfg: ReviewConfig;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.from("review_config").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    cfg = await getReviewConfig();
    config = data
      ? { ok: true, message: "Nøklene leses fra databasen." }
      : { ok: false, message: "Ingen lagret kobling ennå – trykk «Lagre kobling» først." };
  } catch (e) {
    cfg = envConfig();
    config = {
      ok: false,
      message:
        "Serveren får ikke lest lagrede nøkler (mangler SUPABASE_SERVICE_ROLE_KEY i Vercel?): " +
        (e instanceof Error ? e.message : String(e)),
    };
  }

  const errText = async (res: Response) => {
    try {
      const j = (await res.json()) as { error?: { message?: string } | string; message?: string };
      const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message;
      return `HTTP ${res.status}: ${m ?? res.statusText}`;
    } catch {
      return `HTTP ${res.status}: ${res.statusText}`;
    }
  };

  let google: SourceTest;
  if (!cfg.googleEnabled) google = { ok: false, message: "Skrudd av («Vis Google» er ikke krysset av)." };
  else if (!cfg.googleKey || !cfg.googlePlaceId) google = { ok: false, message: "Place-ID eller API-nøkkel mangler." };
  else {
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(cfg.googlePlaceId)}?languageCode=no`,
        {
          headers: {
            "X-Goog-Api-Key": cfg.googleKey,
            Referer: "https://downtownbarbers.no/",
            "X-Goog-FieldMask": "displayName,rating,userRatingCount",
          },
          cache: "no-store",
        },
      );
      if (!res.ok) google = { ok: false, message: await errText(res) };
      else {
        const d = (await res.json()) as {
          displayName?: { text?: string };
          rating?: number;
          userRatingCount?: number;
        };
        google = {
          ok: true,
          message: `${d.displayName?.text ?? "Stedet"}: ${d.rating ?? "–"} ★ fra ${d.userRatingCount ?? 0} anmeldelser.`,
        };
      }
    } catch (e) {
      google = { ok: false, message: "Nettverksfeil: " + (e instanceof Error ? e.message : String(e)) };
    }
  }

  let tripadvisor: SourceTest;
  if (!cfg.taEnabled) tripadvisor = { ok: false, message: "Skrudd av." };
  else if (!cfg.taKey || !cfg.taLoc) tripadvisor = { ok: false, message: "Ikke satt opp ennå." };
  else {
    try {
      const res = await fetch(
        `https://api.content.tripadvisor.com/api/v1/location/${encodeURIComponent(cfg.taLoc)}/details?key=${encodeURIComponent(cfg.taKey)}&language=no`,
        { headers: { accept: "application/json", Referer: "https://downtownbarbers.no/" }, cache: "no-store" },
      );
      if (!res.ok) tripadvisor = { ok: false, message: await errText(res) };
      else {
        const d = (await res.json()) as { name?: string; rating?: string; num_reviews?: string };
        tripadvisor = {
          ok: true,
          message: `${d.name ?? "Stedet"}: ${d.rating ?? "–"} ★ fra ${d.num_reviews ?? 0} anmeldelser.`,
        };
      }
    } catch (e) {
      tripadvisor = { ok: false, message: "Nettverksfeil: " + (e instanceof Error ? e.message : String(e)) };
    }
  }

  let trustpilot: SourceTest;
  if (!cfg.tpEnabled) trustpilot = { ok: false, message: "Skrudd av." };
  else if (!cfg.tpKey || !cfg.tpBusinessUnitId)
    trustpilot = { ok: false, message: "API-nøkkel eller Business Unit-ID mangler." };
  else {
    try {
      const res = await fetch(
        `https://api.trustpilot.com/v1/business-units/${encodeURIComponent(cfg.tpBusinessUnitId)}`,
        { headers: { apikey: cfg.tpKey, accept: "application/json" }, cache: "no-store" },
      );
      if (!res.ok) trustpilot = { ok: false, message: await errText(res) };
      else {
        const d = (await res.json()) as TpUnit;
        const stars = d.score?.stars ?? d.score?.trustScore ?? "–";
        trustpilot = {
          ok: true,
          message: `${d.displayName ?? "Stedet"}: ${stars} ★ fra ${d.numberOfReviews?.total ?? 0} anmeldelser.`,
        };
      }
    } catch (e) {
      trustpilot = { ok: false, message: "Nettverksfeil: " + (e instanceof Error ? e.message : String(e)) };
    }
  }

  return { config, google, tripadvisor, trustpilot };
}
