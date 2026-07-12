/**
 * Central runtime configuration for Downtown Barbers.
 *
 * Single source of truth for which integrations run in mock vs. real mode.
 * Mode is derived ONLY from the presence of environment variables, so
 * go-live = fill in .env, redeploy. No code changes.
 *
 * Server-only for secrets — all external calls stay in server components
 * and route handlers.
 */

export type VippsMode = 'mock' | 'test' | 'production'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// ---------- Shopify ----------
const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN ?? ''
const shopifyToken = process.env.SHOPIFY_STOREFRONT_TOKEN ?? ''
const shopifyEnabled = Boolean(shopifyDomain && shopifyToken)

// ---------- Vipps ----------
const vippsCredentialsPresent = Boolean(
  process.env.VIPPS_CLIENT_ID &&
    process.env.VIPPS_CLIENT_SECRET &&
    process.env.VIPPS_SUBSCRIPTION_KEY &&
    process.env.VIPPS_MSN
)

const vippsMode: VippsMode = !vippsCredentialsPresent
  ? 'mock'
  : process.env.VIPPS_ENV === 'production'
    ? 'production'
    : 'test'

// ---------- Email ----------
const emailFrom =
  process.env.EMAIL_FROM?.trim() || 'Downtown Barbers <onboarding@resend.dev>'

export const config = {
  baseUrl,

  shopify: {
    /** true when real Storefront API credentials exist */
    enabled: shopifyEnabled,
    domain: shopifyDomain,
    storefrontToken: shopifyToken,
    apiVersion: '2025-04',
    endpoint: shopifyEnabled
      ? `https://${shopifyDomain}/api/2025-04/graphql.json`
      : '',
  },

  vipps: {
    mode: vippsMode,
    clientId: process.env.VIPPS_CLIENT_ID ?? '',
    clientSecret: process.env.VIPPS_CLIENT_SECRET ?? '',
    subscriptionKey: process.env.VIPPS_SUBSCRIPTION_KEY ?? '',
    merchantSerialNumber: process.env.VIPPS_MSN ?? '',
    apiBase:
      vippsMode === 'production'
        ? 'https://api.vipps.no'
        : 'https://apitest.vipps.no',
  },

  email: {
    from: emailFrom,
    /** true once the real domain is verified and EMAIL_FROM is set */
    usingVerifiedDomain: Boolean(process.env.EMAIL_FROM),
  },
} as const

/** Convenience: is any part of the site running on placeholders? */
export function isDemoMode(): boolean {
  return !config.shopify.enabled || config.vipps.mode === 'mock'
}
