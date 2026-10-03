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

const vippsMode: VippsMode = !vippsCredentialsPresent
  ? "mock"
  : process.env.VIPPS_ENV === "production"
    ? "production"
    : "test";

export const config = {
  baseUrl,
  vipps: {
    mode: vippsMode,
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
