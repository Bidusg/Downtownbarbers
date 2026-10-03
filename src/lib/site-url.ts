/**
 * Kanonisk basis-URL for alle lenker vi bygger server-side (e-postlenker,
 * logo i e-post, avbestill/min-side, passord-reset osv.).
 *
 * Rekkefølge – første som finnes vinner:
 *   1. NEXT_PUBLIC_SITE_URL  – eksplisitt satt (full kontroll/overstyring).
 *   2. VERCEL_PROJECT_PRODUCTION_URL – settes AUTOMATISK av Vercel til det
 *      stabile produksjonsdomenet. Den peker på den nyeste produksjons-
 *      deployen uansett build-hash, og blir automatisk det egne domenet
 *      (downtownbarbers.no) så snart det er satt som produksjonsdomene.
 *      Så selv uten NEXT_PUBLIC_SITE_URL får e-postlenkene riktig adresse,
 *      både før og etter domene-cutover – ingen manuell endring nødvendig.
 *   3. https://downtownbarbers.no – siste fallback.
 *
 * Merk: VERCEL_PROJECT_PRODUCTION_URL kommer uten protokoll, så vi legger på
 * https:// selv.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "https://downtownbarbers.no";
}
