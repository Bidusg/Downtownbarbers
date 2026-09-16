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
};

function envConfig(): ReviewConfig {
  return {
    googleKey: process.env.GOOGLE_PLACES_API_KEY || null,
    googlePlaceId: process.env.GOOGLE_PLACES_ID || null,
    googleEnabled: true,
    taKey: process.env.TRIPADVISOR_API_KEY || null,
    taLoc: process.env.TRIPADVISOR_LOCATION_ID || null,
    taEnabled: true,
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
    };
  } catch {
    return env; // ingen service-nøkkel → env-styrt som før
  }
}

export type SourceKey = "internal" | "google" | "tripadvisor";

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
    authorAttribution?: { displayName?: string; uri?: string };
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
          "X-Goog-FieldMask":
            "rating,userRatingCount,googleMapsUri,reviews.rating,reviews.text,reviews.originalText,reviews.relativePublishTimeDescription,reviews.authorAttribution",
        },
        next: { revalidate: REVALIDATE },
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
        text: (r.text?.text ?? r.originalText?.text ?? "").trim(),
        when: r.relativePublishTimeDescription ?? "",
        url: r.authorAttribution?.uri ?? url,
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
  const auth = `key=${encodeURIComponent(key)}&language=no`;
  try {
    const [dRes, rRes] = await Promise.all([
      fetch(`${base}/details?${auth}`, {
        headers: { accept: "application/json" },
        next: { revalidate: REVALIDATE },
      }),
      fetch(`${base}/reviews?${auth}`, {
        headers: { accept: "application/json" },
        next: { revalidate: REVALIDATE },
      }),
    ]);
    if (!dRes.ok) return null;
    const d = (await dRes.json()) as TaDetails;
    const rating = Number(d.rating) || 0;
    const count = Number(d.num_reviews) || 0;
    const url = d.web_url ?? null;

    let recent: AggregatedReview[] = [];
    if (rRes.ok) {
      const rv = (await rRes.json()) as TaReviews;
      recent = (rv.data ?? [])
        .map((r) => ({
          source: "tripadvisor" as const,
          sourceLabel: "TripAdvisor",
          author: r.user?.username ?? "TripAdvisor-bruker",
          rating: Number(r.rating) || 0,
          text: (r.text ?? "").trim(),
          when: r.published_date ? relTime(r.published_date) : "",
          url: r.url ?? url,
        }))
        .filter((r) => r.text.length > 0);
    }
    return {
      source: {
        key: "tripadvisor",
        label: "TripAdvisor",
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
  const [google, tripadvisor] = await Promise.all([
    googleSource(cfg),
    tripadvisorSource(cfg),
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
  const [internal, google, tripadvisor] = await Promise.all([
    internalPublicSource(),
    googleSource(cfg),
    tripadvisorSource(cfg),
  ]);

  const sources: ReviewSource[] = [];
  const recent: AggregatedReview[] = [];
  if (internal) sources.push(internal);
  if (google) {
    sources.push(google.source);
    recent.push(...google.recent);
  }
  if (tripadvisor) {
    sources.push(tripadvisor.source);
    recent.push(...tripadvisor.recent);
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
};

export async function getReviewConfigAdmin(): Promise<ReviewConfigStatus> {
  const envG = Boolean(process.env.GOOGLE_PLACES_API_KEY);
  const envT = Boolean(process.env.TRIPADVISOR_API_KEY);
  const fallback: ReviewConfigStatus = {
    googlePlaceId: process.env.GOOGLE_PLACES_ID || "",
    googleEnabled: true,
    googleKeySet: envG,
    taLocationId: process.env.TRIPADVISOR_LOCATION_ID || "",
    taEnabled: true,
    taKeySet: envT,
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
    };
  } catch {
    return fallback;
  }
}
