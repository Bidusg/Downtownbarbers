"use client";

/* =====================================================================
 * Sporingshendelser fra nettleseren. Gjør ingenting hvis besøkende ikke
 * har samtykket (skriptene er da aldri lastet → gtag/fbq finnes ikke).
 * ===================================================================== */

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
    dataLayer?: unknown[];
    __dtbAds?: { id: string; label: string } | null;
  }
}

/** Kunden har fullført en booking på nett. */
export function trackBookingComplete(o: { value: number; services: string[] }): void {
  try {
    const value = Math.max(0, Math.round(o.value || 0));
    const g = window.gtag;
    if (g) {
      // GA4: marker «booking_complete» som nøkkelhendelse i Google Analytics.
      g("event", "booking_complete", { value, currency: "NOK", items: o.services.map((s) => ({ item_name: s })) });
      g("event", "generate_lead", { value, currency: "NOK" });
      // Google Ads-konvertering (hvis etikett er satt og markedsføring er godtatt).
      const ads = window.__dtbAds;
      if (ads?.id && ads.label) g("event", "conversion", { send_to: `${ads.id}/${ads.label}`, value, currency: "NOK" });
    }
    // Meta: standardhendelsen for timebestilling.
    window.fbq?.("track", "Schedule", { value, currency: "NOK" });
  } catch {
    /* sporing skal aldri påvirke bookingen */
  }
}

/** Kunden har startet en booking (valgt tjeneste). */
export function trackBookingStart(): void {
  try {
    window.gtag?.("event", "booking_start");
    window.fbq?.("trackCustom", "BookingStart");
  } catch {
    /* ignorer */
  }
}
