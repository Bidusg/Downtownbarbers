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

const REVALIDATE = 21600; // 6t

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

async function googleSource(): Promise<{
  source: ReviewSource;
  recent: AggregatedReview[];
} | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACES_ID;
  if (!key || !placeId) return null;
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

async function tripadvisorSource(): Promise<{
  source: ReviewSource;
  recent: AggregatedReview[];
} | null> {
  const key = process.env.TRIPADVISOR_API_KEY;
  const loc = process.env.TRIPADVISOR_LOCATION_ID;
  if (!key || !loc) return null;
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
  const [google, tripadvisor] = await Promise.all([
    googleSource(),
    tripadvisorSource(),
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
  const [internal, google, tripadvisor] = await Promise.all([
    internalPublicSource(),
    googleSource(),
    tripadvisorSource(),
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

/** Kilder som IKKE er satt opp (til «koble til»-hint i UI). */
export function unconfiguredSources(): { key: SourceKey; label: string }[] {
  const missing: { key: SourceKey; label: string }[] = [];
  if (!process.env.GOOGLE_PLACES_API_KEY || !process.env.GOOGLE_PLACES_ID)
    missing.push({ key: "google", label: "Google" });
  if (!process.env.TRIPADVISOR_API_KEY || !process.env.TRIPADVISOR_LOCATION_ID)
    missing.push({ key: "tripadvisor", label: "TripAdvisor" });
  return missing;
}
