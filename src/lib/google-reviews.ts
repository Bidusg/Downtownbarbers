/**
 * Google-anmeldelser via Places API (New). Config-styrt som Vipps/Zettle:
 * uten GOOGLE_PLACES_API_KEY + GOOGLE_PLACES_ID henter vi ingenting og
 * komponenten skjuler seg selv. Go-live = fyll inn .env, redeploy.
 *
 * Krever i Vercel:
 *   GOOGLE_PLACES_API_KEY = <API-nøkkel med "Places API (New)" aktivert>
 *   GOOGLE_PLACES_ID      = <Place ID for shopen, f.eks. ChIJ...>
 *
 * Merk (Googles vilkår): anmeldelser vises live og skal krediteres forfatter
 * med lenke til Google. API-et returnerer inntil 5 anmeldelser.
 */

export type GoogleReview = {
  author: string;
  authorUri: string | null;
  photoUri: string | null;
  rating: number;
  text: string;
  relativeTime: string;
};

export type GoogleReviewsData = {
  rating: number;
  total: number;
  mapsUri: string | null;
  reviews: GoogleReview[];
};

export function isGoogleReviewsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_ID,
  );
}

type PlacesResponse = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: Array<{
    rating?: number;
    text?: { text?: string };
    originalText?: { text?: string };
    relativePublishTimeDescription?: string;
    authorAttribution?: {
      displayName?: string;
      uri?: string;
      photoUri?: string;
    };
  }>;
};

/** Henter anmeldelser server-side. Cacher 6t for fart + lav API-kostnad. */
export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  if (!isGoogleReviewsConfigured()) return null;

  const placeId = process.env.GOOGLE_PLACES_ID!;
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId,
  )}?languageCode=no`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "rating,userRatingCount,googleMapsUri,reviews.rating,reviews.text,reviews.originalText,reviews.relativePublishTimeDescription,reviews.authorAttribution",
      },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as PlacesResponse;
    const reviews: GoogleReview[] = (data.reviews ?? [])
      .map((r) => ({
        author: r.authorAttribution?.displayName ?? "Google-bruker",
        authorUri: r.authorAttribution?.uri ?? null,
        photoUri: r.authorAttribution?.photoUri ?? null,
        rating: r.rating ?? 0,
        text: r.text?.text ?? r.originalText?.text ?? "",
        relativeTime: r.relativePublishTimeDescription ?? "",
      }))
      .filter((r) => r.text.trim().length > 0);

    if (reviews.length === 0) return null;

    return {
      rating: data.rating ?? 0,
      total: data.userRatingCount ?? 0,
      mapsUri: data.googleMapsUri ?? null,
      reviews,
    };
  } catch {
    return null;
  }
}
