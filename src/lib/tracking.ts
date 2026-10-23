import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * SPORING (Google Analytics 4, Google Ads, Meta piksel)
 *   ID-ene settes i admin → Integrasjoner → «Sporing» (settings-nøkkel
 *   «tracking»), eller som miljøvariabler i Vercel. ID-ene er ikke hemmelige
 *   (de står uansett i nettsidens kode). Ingenting lastes før besøkende har
 *   samtykket i cookie-banneret (ekomloven § 3-15).
 * ===================================================================== */

export type TrackingConfig = {
  /** Google Analytics 4, f.eks. G-ABC123XYZ */
  ga4: string;
  /** Google Ads-konto, f.eks. AW-123456789 */
  adsId: string;
  /** Konverteringsetikett for «booking fullført» i Google Ads */
  adsLabel: string;
  /** Meta (Facebook/Instagram) piksel-ID, f.eks. 123456789012345 */
  metaPixel: string;
};

export const EMPTY_TRACKING: TrackingConfig = { ga4: "", adsId: "", adsLabel: "", metaPixel: "" };

const RX = {
  ga4: /^G-[A-Z0-9]{4,20}$/,
  adsId: /^AW-\d{6,15}$/,
  adsLabel: /^[A-Za-z0-9_-]{4,40}$/,
  metaPixel: /^\d{8,20}$/,
};

/** Rens og valider – ugyldige verdier blir tomme (lastes aldri). */
export function cleanTracking(v: Partial<Record<keyof TrackingConfig, unknown>>): TrackingConfig {
  const pick = (k: keyof TrackingConfig) => {
    const s = typeof v[k] === "string" ? (v[k] as string).trim() : "";
    const norm = k === "ga4" || k === "adsId" ? s.toUpperCase() : s;
    return RX[k].test(norm) ? norm : "";
  };
  return { ga4: pick("ga4"), adsId: pick("adsId"), adsLabel: pick("adsLabel"), metaPixel: pick("metaPixel") };
}

export function trackingInvalid(v: Partial<Record<keyof TrackingConfig, string>>): (keyof TrackingConfig)[] {
  const c = cleanTracking(v);
  return (Object.keys(RX) as (keyof TrackingConfig)[]).filter((k) => (v[k] ?? "").trim() !== "" && !c[k]);
}

export async function getTrackingConfig(): Promise<TrackingConfig> {
  const env = cleanTracking({
    ga4: process.env.NEXT_PUBLIC_GA4_ID,
    adsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    adsLabel: process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_LABEL,
    metaPixel: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  });
  try {
    const sb = await createClient();
    const { data } = await sb.from("settings").select("value").eq("key", "tracking").maybeSingle();
    const db = cleanTracking((data?.value ?? {}) as Record<string, unknown>);
    return {
      ga4: db.ga4 || env.ga4,
      adsId: db.adsId || env.adsId,
      adsLabel: db.adsLabel || env.adsLabel,
      metaPixel: db.metaPixel || env.metaPixel,
    };
  } catch {
    return env;
  }
}

export function trackingEnabled(c: TrackingConfig): boolean {
  return Boolean(c.ga4 || c.adsId || c.metaPixel);
}
