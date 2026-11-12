/**
 * Runtime-konfig for eksterne integrasjoner. Modus utledes KUN fra miljø-
 * variabler, så go-live = fyll inn .env, redeploy. Ingen kodeendringer.
 * (Tilpasset og gjenbrukt fra tidligere app-versjon.)
 */

import { siteUrl } from "@/lib/site-url";

export type VippsMode = "mock" | "test" | "production";

// På Vercel (eller når NEXT_PUBLIC_SITE_URL er satt): samme auto-utledede URL
// som e-postlenkene bruker. Ellers lokal utvikling → localhost.
const onDeployedHost = Boolean(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim(),
);
const baseUrl = onDeployedHost ? siteUrl() : "http://localhost:3000";

const vippsCredentialsPresent = Boolean(
  process.env.VIPPS_CLIENT_ID &&
    process.env.VIPPS_CLIENT_SECRET &&
    process.env.VIPPS_SUBSCRIPTION_KEY &&
    process.env.VIPPS_MSN,
);

// Mock brukes KUN lokalt/utvikling eller når VIPPS_MOCK=1 er satt eksplisitt.
// I produksjon uten nøkler er Vipps «disabled» (ingen mock-betalinger som
// markeres betalt uten at penger flyttes) – se vippsDisabled / isVippsDisabled().
const mockAllowed =
  process.env.VIPPS_MOCK === "1" || process.env.NODE_ENV !== "production";

const vippsDisabled = !vippsCredentialsPresent && !mockAllowed;

const vippsMode: VippsMode = !vippsCredentialsPresent
  ? mockAllowed
    ? "mock"
    : "test" // disabled: aldri «mock»; createPayment avviser før noe kalles
  : process.env.VIPPS_ENV === "production"
    ? "production"
    : "test";

export const config = {
  baseUrl,
  vipps: {
    mode: vippsMode,
    /** true = produksjon uten Vipps-nøkler: betaling med Vipps er slått av. */
    disabled: vippsDisabled,
    clientId: process.env.VIPPS_CLIENT_ID ?? "",
    clientSecret: process.env.VIPPS_CLIENT_SECRET ?? "",
    subscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? "",
    merchantSerialNumber: process.env.VIPPS_MSN ?? "",
    apiBase:
      vippsMode === "production"
        ? "https://api.vipps.no"
        : "https://apitest.vipps.no",
  },
} as const;

export function isVippsMock(): boolean {
  return config.vipps.mode === "mock";
}

/** Vipps er av (produksjon uten nøkler og uten VIPPS_MOCK=1). */
export function isVippsDisabled(): boolean {
  return config.vipps.disabled;
}

export const VIPPS_DISABLED_MESSAGE =
  "Vipps-betaling er ikke tilgjengelig akkurat nå. Velg en annen betalingsmåte.";
