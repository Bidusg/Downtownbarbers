/* =====================================================================
 * NETTBUTIKK – delte typer og hjelpere (klient + server).
 * ===================================================================== */

export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[];
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
  /** Hvor populært produktet er (solgte enheter siste 180 dager + litt tilfeldig blanding). */
  popularity: number;
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

/* ---------------------------------------------------------------------
 * KATEGORIER – avdeling → produkttype (som de store nettbutikkene).
 * Lagres som nøkler i products.category / products.subcategory.
 * ------------------------------------------------------------------- */
export type Sub = { key: string; no: string; en: string };
export type Dept = { key: string; no: string; en: string; introNo: string; introEn: string; subs: Sub[] };

export const TAXONOMY: Dept[] = [
  {
    key: "har",
    no: "Hår",
    en: "Hair",
    introNo: "Styling og pleie – fra matt leire til blank pomade, sjampo og kur.",
    introEn: "Styling and care – from matte clay to high-shine pomade, shampoo and treatments.",
    subs: [
      { key: "pomade", no: "Pomade & voks", en: "Pomade & wax" },
      { key: "leire", no: "Leire, pasta & fiber", en: "Clay, paste & fibre" },
      { key: "pudder", no: "Pudder, spray & tonic", en: "Powder, spray & tonic" },
      { key: "krem", no: "Krem & gel", en: "Cream & gel" },
      { key: "sjampo", no: "Sjampo", en: "Shampoo" },
      { key: "balsam", no: "Balsam & kur", en: "Conditioner & treatment" },
      { key: "harfiber", no: "Hårfiber & gråhårsdekking", en: "Hair fibres & grey cover" },
    ],
  },
  {
    key: "skjegg",
    no: "Skjegg",
    en: "Beard",
    introNo: "Alt til et mykt, velstelt skjegg – olje, balm, vask og bartevoks.",
    introEn: "Everything for a soft, well-kept beard – oil, balm, wash and moustache wax.",
    subs: [
      { key: "skjeggolje", no: "Skjeggolje", en: "Beard oil" },
      { key: "skjeggbalm", no: "Balm & softener", en: "Balm & softener" },
      { key: "skjeggvask", no: "Skjeggvask", en: "Beard wash" },
      { key: "bartevoks", no: "Bartevoks", en: "Moustache wax" },
      { key: "skjeggkam", no: "Skjeggkam", en: "Beard comb" },
    ],
  },
  {
    key: "barbering",
    no: "Barbering",
    en: "Shaving",
    introNo: "Før, under og etter – barberkrem, høvler, blader og aftershave.",
    introEn: "Before, during and after – shaving cream, razors, blades and aftershave.",
    subs: [
      { key: "barberkrem", no: "Barberkrem & såpe", en: "Shaving cream & soap" },
      { key: "forbarbering", no: "Før barbering", en: "Pre-shave" },
      { key: "etterbarbering", no: "Etter barbering", en: "Aftershave" },
      { key: "hovler", no: "Høvler, blader & kost", en: "Razors, blades & brushes" },
      { key: "barbermaskiner", no: "Barbermaskiner", en: "Electric shavers" },
    ],
  },
  {
    key: "ansikt",
    no: "Ansikt",
    en: "Face",
    introNo: "Enkel hudpleie for menn – rens, fukt og et friskt løft.",
    introEn: "Simple skincare for men – cleanse, hydrate and refresh.",
    subs: [{ key: "ansiktspleie", no: "Ansiktspleie", en: "Face care" }],
  },
  {
    key: "utstyr",
    no: "Utstyr",
    en: "Tools",
    introNo: "Kammer, børster og klippetilbehør – det samme som barberne bruker.",
    introEn: "Combs, brushes and clipper accessories – the same tools our barbers use.",
    subs: [
      { key: "kammer", no: "Kammer", en: "Combs" },
      { key: "borster", no: "Børster", en: "Brushes" },
      { key: "klippetilbehor", no: "Klippetilbehør", en: "Clipper accessories" },
      { key: "durag", no: "Durag", en: "Durag" },
    ],
  },
];

/** Nettadresse til en kategori / produkttype (som ASOS/Zalando: egne sider). */
export function catUrl(dept?: string | null, sub?: string | null, query?: string): string {
  const base = dept ? `/butikk/kategori/${dept}${sub ? `/${sub}` : ""}` : "/butikk/kategori/alle";
  return query ? `${base}?${query}` : base;
}

/** Gamle kategorinavn (før inndelingen) → avdeling. */
const LEGACY_DEPT: Record<string, string> = {
  Styling: "har",
  Hårpleie: "har",
  "Hårfiber og dekking": "har",
  Skjegg: "skjegg",
  Barbering: "barbering",
  "Verktøy og tilbehør": "utstyr",
};

export function deptOf(category: string | null | undefined): Dept | null {
  if (!category) return null;
  const k = LEGACY_DEPT[category] ?? category;
  return TAXONOMY.find((d) => d.key === k) ?? null;
}
export function subOf(p: { category: string | null; subcategory: string | null }): Sub | null {
  const d = deptOf(p.category);
  return d?.subs.find((s) => s.key === p.subcategory) ?? null;
}

/* ---------------------------------------------------------------------
 * BEHOV – «Finn produktet ditt». Satt sammen av tags + hold/glans.
 * ------------------------------------------------------------------- */
export type Need = { key: string; no: string; en: string; hintNo: string; hintEn: string; match: (p: ShopProduct) => boolean };

export const NEEDS: Need[] = [
  { key: "matt", no: "Matt look", en: "Matte look", hintNo: "Naturlig, ingen glans", hintEn: "Natural, no shine", match: (p) => p.shine != null && p.shine <= 1 },
  { key: "blank", no: "Klassisk blank", en: "Classic shine", hintNo: "Slick back og sideskill", hintEn: "Slick backs and side parts", match: (p) => p.shine != null && p.shine >= 4 },
  { key: "volum", no: "Mer volum", en: "More volume", hintNo: "Løft fra roten", hintEn: "Lift from the root", match: (p) => p.tags.includes("volum") || p.subcategory === "pudder" },
  { key: "sterkt", no: "Sterkt hold", en: "Strong hold", hintNo: "Holder hele dagen", hintEn: "Lasts all day", match: (p) => p.hold != null && p.hold >= 4 },
  { key: "krøller", no: "Krøller", en: "Curls", hintNo: "Definisjon uten krus", hintEn: "Definition without frizz", match: (p) => p.tags.includes("krøller") },
  { key: "grått-hår", no: "Grått hår", en: "Grey hair", hintNo: "Dekk eller pleie gråtoner", hintEn: "Cover or care for grey", match: (p) => p.tags.includes("grått-hår") },
  { key: "tynt-har", no: "Tynt hår", en: "Thinning hair", hintNo: "Fyldigere hår", hintEn: "Fuller-looking hair", match: (p) => p.tags.includes("tynt-har") },
  { key: "sensitiv", no: "Sensitiv hud", en: "Sensitive skin", hintNo: "Skånsomt og beroligende", hintEn: "Gentle and soothing", match: (p) => p.tags.includes("sensitiv") },
  { key: "fet-hodebunn", no: "Fet hodebunn", en: "Oily scalp", hintNo: "Renser og balanserer", hintEn: "Cleanses and balances", match: (p) => p.tags.includes("fet-hodebunn") },
];

/** Alle tags admin kan velge (behov som styres av tags). */
export const TAG_OPTIONS = [
  { key: "volum", no: "Mer volum" },
  { key: "krøller", no: "Krøller" },
  { key: "grått-hår", no: "Grått hår" },
  { key: "tynt-har", no: "Tynt hår / hårtap" },
  { key: "sensitiv", no: "Sensitiv hud" },
  { key: "fet-hodebunn", no: "Fet hodebunn" },
  { key: "reise", no: "Reisestørrelse" },
  { key: "storpakning", no: "Storpakning" },
];

/* Hold og finish i ord (1–5 / 0–5). */
export function holdGroup(h: number | null): { key: string; no: string; en: string } | null {
  if (h == null) return null;
  if (h <= 2) return { key: "lett", no: "Lett hold", en: "Light hold" };
  if (h === 3) return { key: "medium", no: "Medium hold", en: "Medium hold" };
  if (h === 4) return { key: "sterkt", no: "Sterkt hold", en: "Strong hold" };
  return { key: "ekstra", no: "Ekstra sterkt", en: "Extra strong" };
}
export function finishGroup(s: number | null): { key: string; no: string; en: string } | null {
  if (s == null) return null;
  if (s <= 1) return { key: "matt", no: "Matt", en: "Matte" };
  if (s <= 3) return { key: "naturlig", no: "Naturlig glans", en: "Natural shine" };
  return { key: "blank", no: "Blank", en: "High shine" };
}
export const HOLD_ORDER = ["lett", "medium", "sterkt", "ekstra"];
export const FINISH_ORDER = ["matt", "naturlig", "blank"];

/** Prisgrupper til filteret. */
export const PRICE_BANDS = [
  { key: "0-199", no: "Under 200 kr", en: "Under 200 kr", min: 0, max: 199.99 },
  { key: "200-299", no: "200–299 kr", en: "200–299 kr", min: 200, max: 299.99 },
  { key: "300-499", no: "300–499 kr", en: "300–499 kr", min: 300, max: 499.99 },
  { key: "500+", no: "500 kr og mer", en: "500 kr and up", min: 500, max: Infinity },
];

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
