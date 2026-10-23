/**
 * Kanonisk basis-URL for alle lenker vi bygger server-side (e-postlenker,
 * logo i e-post, avbestill/min-side, passord-reset osv.).
 *
 * Rekkefølge – første som finnes vinner:
 *   1. NEXT_PUBLIC_SITE_URL  – eksplisitt satt (full kontroll/overstyring).
 *   2. Produksjon på Vercel (VERCEL_ENV=production) → https://downtownbarbers.no.
 *      VERCEL_PROJECT_PRODUCTION_URL ga test-adressen (*.vercel.app) i
 *      sitemap/robots/e-post, så den brukes nå bare for forhåndsvisninger.
 *   3. VERCEL_PROJECT_PRODUCTION_URL – settes AUTOMATISK av Vercel til det
 *      stabile produksjonsdomenet. Den peker på den nyeste produksjons-
 *      deployen uansett build-hash, og blir automatisk det egne domenet
 *      (downtownbarbers.no) så snart det er satt som produksjonsdomene.
 *      Så selv uten NEXT_PUBLIC_SITE_URL får e-postlenkene riktig adresse,
 *      både før og etter domene-cutover – ingen manuell endring nødvendig.
 *   4. https://downtownbarbers.no – siste fallback.
 *
 * Merk: VERCEL_PROJECT_PRODUCTION_URL kommer uten protokoll, så vi legger på
 * https:// selv.
 */
/** Det egne domenet – alltid uten www. */
export const CANONICAL_URL = "https://downtownbarbers.no";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  if (process.env.VERCEL_ENV === "production") return CANONICAL_URL;

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return CANONICAL_URL;
}

/**
 * Adresse for søkemotorer og deling (sitemap, robots, canonical, OG):
 * aldri test-adressen på Vercel, alltid det egne domenet.
 */
export function seoUrl(): string {
  const u = siteUrl().replace(/:\/\/www\./, "://");
  return /\.vercel\.app$/i.test(u.replace(/^https?:\/\//, "")) ? CANONICAL_URL : u;
}
