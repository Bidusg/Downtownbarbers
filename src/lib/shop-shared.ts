/* =====================================================================
 * NETTBUTIKK – delte typer og hjelpere (klient + server).
 * ===================================================================== */

export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  short: string | null;
  description: string | null;
  benefits: string[];
  recommendedFor: string | null;
  howToUse: string | null;
  ingredients: string | null;
  size: string | null;
  hold: number | null;
  shine: number | null;
  price: number;
  compareAt: number | null;
  images: string[];
  stock: number;
  featured: boolean;
  related: string[];
  isGiftCard: boolean;
};

export type WebshopSettings = {
  live: boolean;
  shippingNok: number;
  freeOverNok: number;
  pickup: boolean;
  ship: boolean;
  payAtPickup: boolean;
  /** Kort via Vipps (krever at kortbetaling er slått på i Vipps-avtalen). */
  card: boolean;
};

export const DEFAULT_SETTINGS: WebshopSettings = {
  live: false,
  shippingNok: 79,
  freeOverNok: 599,
  pickup: true,
  ship: true,
  payAtPickup: true,
  card: false,
};

/** Kategorier i fast rekkefølge (det kundene oftest ser etter først). */
export const CATEGORIES = [
  "Styling",
  "Skjegg",
  "Barbering",
  "Hårpleie",
  "Hårfiber og dekking",
  "Verktøy og tilbehør",
] as const;

export const CATEGORY_EN: Record<string, string> = {
  Styling: "Styling",
  Skjegg: "Beard",
  Barbering: "Shaving",
  Hårpleie: "Hair care",
  "Hårfiber og dekking": "Hair fibres & cover",
  "Verktøy og tilbehør": "Tools & accessories",
};

const NF = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
export const kr = (n: number) => `${NF.format(Math.round(n))} kr`;

/** Lagerstatus som kunden ser. */
export function stockLabel(stock: number): { tone: "ok" | "low" | "out"; no: string; en: string } {
  if (stock <= 0) return { tone: "out", no: "Utsolgt", en: "Sold out" };
  if (stock <= 3) return { tone: "low", no: `Bare ${stock} igjen`, en: `Only ${stock} left` };
  return { tone: "ok", no: "På lager", en: "In stock" };
}

export type CartLine = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  price: number;
  image: string | null;
  stock: number;
  qty: number;
};

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.price * l.qty, 0);
}
