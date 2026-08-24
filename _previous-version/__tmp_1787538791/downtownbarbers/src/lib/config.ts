/**
 * Runtime-konfig for eksterne integrasjoner. Modus utledes KUN fra miljø-
 * variabler, så go-live = fyll inn .env, redeploy. Ingen kodeendringer.
 * (Tilpasset og gjenbrukt fra tidligere app-versjon.)
 */

export type VippsMode = "mock" | "test" | "production";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
