/* =====================================================================
 * PRISKALKULATOR – ren regnemodul (ingen Supabase/React).
 *   Brukes av kalkulatoren i varedialogen, varemargin-oversikten og
 *   Excel-rapportene, så alle steder regner likt.
 *
 *   Konvensjoner:
 *    - Utsalgspris (products.price_nok) er INKL. 25 % mva.
 *    - Innkjøpspris (product_costs.cost_nok) er EKS. mva.
 *    - Margin  = profitt / utsalg eks. mva   (brøk: 0.5 = 50 %)
 *    - Påslag  = profitt / innkjøp           (brøk: 1.0 = 100 %)
 *    - Profitt = utsalg eks. mva − innkjøp   (kr per vare)
 * ===================================================================== */

export const MVA = 0.25;
/** Standard målmargin for «foreslå pris». */
export const TARGET_MARGIN = 0.5;
/** Under denne marginen varsles «lav margin». */
export const LOW_MARGIN = 0.4;
/** Over denne marginen merkes «svært høy» (sjekk at varen selger). */
export const HIGH_MARGIN = 0.8;

export type MarginLevel = "mangler" | "tap" | "lav" | "ok" | "høy";

export type PriceCalc = {
  priceInkl: number | null;
  priceEks: number | null;
  cost: number | null;
  /** Kr per vare, eks. mva. */
  profit: number | null;
  /** Brøk av utsalg eks. mva. */
  margin: number | null;
  /** Brøk av innkjøp. */
  markup: number | null;
  /** Lager brukt i lagerverdi (negativt lager teller som 0). */
  stock: number;
  /** Lager × innkjøp (eks. mva). Null når innkjøp mangler. */
  stockValueCost: number | null;
  /** Lager × utsalg inkl. mva. */
  stockValueRetail: number | null;
  /** Lager × utsalg eks. mva. */
  stockValueRetailEks: number | null;
  level: MarginLevel;
};

/** Gjør input om til et endelig tall, ellers null. Godtar «89,50». */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Rund til øre (2 desimaler) uten flyttallsstøy. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function eksFromInkl(inkl: number): number {
  return inkl / (1 + MVA);
}

export function inklFromEks(eks: number): number {
  return eks * (1 + MVA);
}

/** Nivå for en margin (brøk). Null margin = «mangler». */
export function marginLevel(margin: number | null): MarginLevel {
  if (margin === null) return "mangler";
  if (margin < 0) return "tap";
  if (margin < LOW_MARGIN) return "lav";
  if (margin >= HIGH_MARGIN) return "høy";
  return "ok";
}

/**
 * Alle tall for én vare. Tåler null/NaN/tekst i input: det som ikke kan
 * regnes blir null (aldri NaN/Infinity).
 */
export function calcPrice(input: { priceInkl: unknown; cost: unknown; stock?: unknown }): PriceCalc {
  const priceInkl = toNum(input.priceInkl);
  const costRaw = toNum(input.cost);
  const cost = costRaw !== null && costRaw >= 0 ? costRaw : null;
  const stockRaw = toNum(input.stock);
  const stock = stockRaw !== null && stockRaw > 0 ? Math.floor(stockRaw) : 0;

  const priceEks = priceInkl !== null && priceInkl >= 0 ? eksFromInkl(priceInkl) : null;
  const profit = priceEks !== null && cost !== null ? priceEks - cost : null;
  const margin = profit !== null && priceEks !== null && priceEks > 0 ? profit / priceEks : null;
  const markup = profit !== null && cost !== null && cost > 0 ? profit / cost : null;

  return {
    priceInkl,
    priceEks,
    cost,
    profit,
    margin,
    markup,
    stock,
    stockValueCost: cost !== null ? stock * cost : null,
    stockValueRetail: priceInkl !== null && priceInkl >= 0 ? stock * priceInkl : null,
    stockValueRetailEks: priceEks !== null ? stock * priceEks : null,
    level: marginLevel(margin),
  };
}

/** Minste heltall ≥ n som slutter på 9 (372,5 → 379, 550 → 559, 449 → 449). */
export function prettyUp9(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  const c = Math.ceil(n - 1e-9);
  const r = ((c % 10) + 10) % 10;
  return c + ((9 - r + 10) % 10);
}

/**
 * Foreslått utsalgspris INKL. mva for ønsket margin, avrundet OPP til
 * nærmeste ,-9 (så marginen aldri blir lavere enn målet).
 * Null når innkjøp mangler eller margin er utenfor [0, 1).
 */
export function suggestPrice(cost: unknown, targetMargin: number = TARGET_MARGIN): number | null {
  const c = toNum(cost);
  if (c === null || c <= 0) return null;
  if (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin >= 1) return null;
  const inkl = inklFromEks(c / (1 - targetMargin));
  return prettyUp9(round2(inkl));
}

export const LEVEL_LABEL: Record<MarginLevel, string> = {
  mangler: "Mangler innkjøpspris",
  tap: "Selges under innkjøpspris",
  lav: "Lav margin",
  ok: "OK",
  høy: "Svært høy – sjekk at den selger",
};
