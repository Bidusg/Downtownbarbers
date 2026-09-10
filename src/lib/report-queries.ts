import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * RAPPORT-MOTOR
 *   Fixit-stil rapporter over en valgfri periode. All omsetning regnes
 *   som union av interne salg (`sales`, fra kassen) + eksterne salg
 *   (`external_sales`, speilet fra Zettle) slik at totalene stemmer.
 *   Alle tidsavgrensninger og bøtter er i Europe/Oslo.
 *   Defensivt: hver funksjon svarer med tomt resultat ved feil.
 * ===================================================================== */

const OSLO = "Europe/Oslo";

/* ---------- Oslo-hjelpere ---------- */

/** yyyy-mm-dd i Oslo. */
function osloDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: OSLO });
}
/** yyyy-mm i Oslo. */
function osloMonthKey(iso: string): string {
  return osloDayKey(iso).slice(0, 7);
}
/** Time på døgnet 0–23 i Oslo. */
function osloHour(iso: string): number {
  const h = new Date(iso).toLocaleString("en-GB", {
    timeZone: OSLO,
    hour: "2-digit",
    hour12: false,
  });
  return Number(h) % 24;
}
/** Ukedag i Oslo, mandag=0 … søndag=6. */
function osloWeekday(iso: string): number {
  const wd = new Date(iso).toLocaleDateString("en-US", {
    timeZone: OSLO,
    weekday: "short",
  });
  const map: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return map[wd] ?? 0;
}
/** ISO-uke-nøkkel "yyyy-Www" + midt-i-uka-dato for sortering, basert på Oslo-dagen. */
function osloIsoWeek(iso: string): { key: string; label: string } {
  const dayKey = osloDayKey(iso); // yyyy-mm-dd
  const [y, m, d] = dayKey.split("-").map(Number);
  // Bruk UTC-basert dato for stabil ISO-uke-beregning (dagen er allerede Oslo-lokal).
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; // man=0
  dt.setUTCDate(dt.getUTCDate() - day + 3); // torsdag i denne uka
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((dt.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  const isoYear = dt.getUTCFullYear();
  return {
    key: `${isoYear}-W${String(week).padStart(2, "0")}`,
    label: `Uke ${week}`,
  };
}

/** Oslo-lokal midnatt (UTC-instant) for en gitt kalenderdato. */
function osloMidnight(y: number, m: number, d: number): string {
  const base = Date.UTC(y, m - 1, d);
  const utc = new Date(base).toLocaleString("en-US", { timeZone: "UTC" });
  const loc = new Date(base).toLocaleString("en-US", { timeZone: OSLO });
  const offset = new Date(loc).getTime() - new Date(utc).getTime();
  return new Date(base - offset).toISOString();
}

const WEEKDAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const MND = [
  "jan", "feb", "mar", "apr", "mai", "jun",
  "jul", "aug", "sep", "okt", "nov", "des",
];

/* ---------- Periode ---------- */

export type Range = {
  startIso: string;
  endIso: string;
  from: string; // yyyy-mm-dd (inklusiv)
  to: string; // yyyy-mm-dd (inklusiv)
  label: string;
};

const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Løs opp periode fra query-parametre. Standard: inneværende måned (Oslo). */
export function resolveRange(from?: string, to?: string): Range {
  const now = new Date();
  const nowY = Number(now.toLocaleString("en-US", { timeZone: OSLO, year: "numeric" }));
  const nowM = Number(now.toLocaleString("en-US", { timeZone: OSLO, month: "numeric" }));

  let fromStr: string;
  let toStr: string;
  if (isDate(from) && isDate(to)) {
    fromStr = from <= to ? from : to;
    toStr = from <= to ? to : from;
  } else {
    const first = `${nowY}-${String(nowM).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(nowY, nowM, 0)).getUTCDate();
    fromStr = first;
    toStr = `${nowY}-${String(nowM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const startIso = osloMidnight(fy, fm, fd);
  const endIso = osloMidnight(ty, tm, td + 1); // eksklusiv slutt

  const sameMonth = fromStr.slice(0, 7) === toStr.slice(0, 7);
  const firstOfMonth = fd === 1;
  const lastOfMonth = td === new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const label =
    sameMonth && firstOfMonth && lastOfMonth
      ? `${MND[fm - 1]} ${fy}`
      : `${fromStr} – ${toStr}`;

  return { startIso, endIso, from: fromStr, to: toStr, label };
}

/* ---------- Rådata-henting (delt) ---------- */

type SaleRaw = { sold_at: string; total_nok: number; payment_method: string | null; barber: string };
type ExtRaw = { sold_at: string; amount_nok: number; payment_type: string | null };

async function fetchInternalSales(r: Range): Promise<SaleRaw[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("sales")
      .select("sold_at, total_nok, payment_method, staff(full_name)")
      .gte("sold_at", r.startIso)
      .lt("sold_at", r.endIso)
      .limit(100000);
    return (data ?? []).map((s) => ({
      sold_at: s.sold_at as string,
      total_nok: Number(s.total_nok) || 0,
      payment_method: (s.payment_method as string) ?? null,
      barber: (s.staff as { full_name?: string } | null)?.full_name ?? "Ukjent",
    }));
  } catch {
    return [];
  }
}

async function fetchExternalSales(r: Range): Promise<ExtRaw[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("external_sales")
      .select("sold_at, amount_nok, payment_type")
      .gte("sold_at", r.startIso)
      .lt("sold_at", r.endIso)
      .limit(100000);
    return (data ?? []).map((s) => ({
      sold_at: s.sold_at as string,
      amount_nok: Number(s.amount_nok) || 0,
      payment_type: (s.payment_type as string) ?? null,
    }));
  } catch {
    return [];
  }
}

/* ---------- 1) Omsetning over tid ---------- */

export type Granularity = "day" | "week" | "month" | "hour" | "weekday";
export type RevBucket = { key: string; label: string; nok: number };

export const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Per dag" },
  { key: "week", label: "Per uke" },
  { key: "month", label: "Per måned" },
  { key: "hour", label: "Per time" },
  { key: "weekday", label: "Per ukedag" },
];

/** Omsetningsserie i valgt oppløsning, sales + external_sales samlet. */
export async function getRevenueByGranularity(
  r: Range,
  g: Granularity,
): Promise<RevBucket[]> {
  const [internal, external] = await Promise.all([
    fetchInternalSales(r),
    fetchExternalSales(r),
  ]);
  const all: { sold_at: string; nok: number }[] = [
    ...internal.map((s) => ({ sold_at: s.sold_at, nok: s.total_nok })),
    ...external.map((s) => ({ sold_at: s.sold_at, nok: s.amount_nok })),
  ];

  const sums = new Map<string, { label: string; nok: number; sort: string }>();
  const add = (key: string, label: string, sort: string, nok: number) => {
    const cur = sums.get(key) ?? { label, nok: 0, sort };
    cur.nok += nok;
    sums.set(key, cur);
  };

  if (g === "hour") {
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, "0");
      sums.set(k, { label: `${k}:00`, nok: 0, sort: k });
    }
    for (const s of all) {
      const h = String(osloHour(s.sold_at)).padStart(2, "0");
      add(h, `${h}:00`, h, s.nok);
    }
  } else if (g === "weekday") {
    for (let w = 0; w < 7; w++) {
      sums.set(String(w), { label: WEEKDAY_LABELS[w], nok: 0, sort: String(w) });
    }
    for (const s of all) {
      const w = osloWeekday(s.sold_at);
      add(String(w), WEEKDAY_LABELS[w], String(w), s.nok);
    }
  } else if (g === "month") {
    for (const s of all) {
      const key = osloMonthKey(s.sold_at);
      const [yy, mm] = key.split("-").map(Number);
      add(key, `${MND[mm - 1]} ${yy}`, key, s.nok);
    }
  } else if (g === "week") {
    for (const s of all) {
      const { key, label } = osloIsoWeek(s.sold_at);
      add(key, label, key, s.nok);
    }
  } else {
    // day
    for (const s of all) {
      const key = osloDayKey(s.sold_at);
      const [, mm, dd] = key.split("-").map(Number);
      add(key, `${String(dd).padStart(2, "0")}.${String(mm).padStart(2, "0")}`, key, s.nok);
    }
  }

  return Array.from(sums, ([key, v]) => ({ key, label: v.label, nok: Math.round(v.nok) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ---------- 2) Nøkkeltall + per barber + per betalingsmåte ---------- */

export type Breakdown = {
  total: number;
  internal: number;
  external: number;
  saleCount: number;
  avg: number;
  byBarber: { name: string; nok: number }[];
  byMethod: { method: string; nok: number }[];
};

const prettyMethod = (m: string | null): string => {
  const v = (m ?? "").toLowerCase();
  if (!v) return "Ukjent";
  if (v.includes("cash") || v.includes("kontant")) return "Kontant";
  if (v.includes("card") || v.includes("kort")) return "Kort";
  if (v.includes("vipps")) return "Vipps";
  if (v.includes("gift") || v.includes("gave")) return "Gavekort";
  return m as string;
};

export async function getRevenueBreakdown(r: Range): Promise<Breakdown> {
  const [internal, external] = await Promise.all([
    fetchInternalSales(r),
    fetchExternalSales(r),
  ]);
  const barber = new Map<string, number>();
  const method = new Map<string, number>();
  let internalTotal = 0;
  for (const s of internal) {
    internalTotal += s.total_nok;
    barber.set(s.barber, (barber.get(s.barber) ?? 0) + s.total_nok);
    const m = prettyMethod(s.payment_method);
    method.set(m, (method.get(m) ?? 0) + s.total_nok);
  }
  let externalTotal = 0;
  for (const s of external) {
    externalTotal += s.amount_nok;
    const m = prettyMethod(s.payment_type) + " (Zettle)";
    method.set(m, (method.get(m) ?? 0) + s.amount_nok);
  }
  if (externalTotal > 0) {
    barber.set("Eksterne salg (Zettle)", (barber.get("Eksterne salg (Zettle)") ?? 0) + externalTotal);
  }
  const total = internalTotal + externalTotal;
  const saleCount = internal.length + external.length;
  return {
    total: Math.round(total),
    internal: Math.round(internalTotal),
    external: Math.round(externalTotal),
    saleCount,
    avg: saleCount ? Math.round(total / saleCount) : 0,
    byBarber: Array.from(barber, ([name, nok]) => ({ name, nok: Math.round(nok) })).sort((a, b) => b.nok - a.nok),
    byMethod: Array.from(method, ([m, nok]) => ({ method: m, nok: Math.round(nok) })).sort((a, b) => b.nok - a.nok),
  };
}

/* ---------- 3) Per behandlingskategori ---------- */

export type CatRow = { category: string; nok: number; count: number };
export type CategoryReport = {
  rows: CatRow[];
  serviceTotal: number;
  /** Varesalg fanges via Zettle (ikke itemisert per kategori her). */
  productExternal: number;
};

export async function getCategoryBreakdown(r: Range): Promise<CategoryReport> {
  const empty: CategoryReport = { rows: [], serviceTotal: 0, productExternal: 0 };
  try {
    const sb = await createClient();
    // sale_items i perioden (join på sales.sold_at). Kun tjenestelinjer finnes i dag.
    const { data: items } = await sb
      .from("sale_items")
      .select("kind, quantity, price_nok, ref_id, sales!inner(sold_at)")
      .gte("sales.sold_at", r.startIso)
      .lt("sales.sold_at", r.endIso)
      .limit(100000);

    const [{ data: services }, { data: cats }] = await Promise.all([
      sb.from("services").select("id, name, category_id"),
      sb.from("service_categories").select("id, name"),
    ]);
    const catName = new Map<string, string>((cats ?? []).map((c) => [c.id as string, c.name as string]));
    const svcCat = new Map<string, string>();
    const svcName = new Map<string, string>();
    for (const s of services ?? []) {
      svcName.set(s.id as string, s.name as string);
      const cid = s.category_id as string | null;
      svcCat.set(s.id as string, cid ? (catName.get(cid) ?? "Uten kategori") : "Uten kategori");
    }

    const bucket = new Map<string, { nok: number; count: number }>();
    let serviceTotal = 0;
    for (const it of items ?? []) {
      // price_nok er linjebeløp (eneste skriver bruker quantity=1).
      const amt = Number(it.price_nok) || 0;
      const qty = Number(it.quantity) || 1;
      let label: string;
      if ((it.kind as string) === "service" && it.ref_id) {
        label = svcCat.get(it.ref_id as string) ?? "Uten kategori";
      } else if ((it.kind as string) === "product") {
        label = "Produkter";
      } else {
        label = "Annet";
      }
      serviceTotal += amt;
      const cur = bucket.get(label) ?? { nok: 0, count: 0 };
      cur.nok += amt;
      cur.count += qty;
      bucket.set(label, cur);
    }

    // Varesalg via Zettle (total, ikke per kategori).
    const external = await fetchExternalSales(r);
    const productExternal = external.reduce((a, s) => a + s.amount_nok, 0);

    return {
      rows: Array.from(bucket, ([category, v]) => ({
        category,
        nok: Math.round(v.nok),
        count: v.count,
      })).sort((a, b) => b.nok - a.nok),
      serviceTotal: Math.round(serviceTotal),
      productExternal: Math.round(productExternal),
    };
  } catch {
    return empty;
  }
}

/* ---------- 4) MVA-rapport ---------- */

export type Vat = { gross: number; net: number; vat: number };
export type VatReport = {
  rate: number; // prosent
  total: Vat;
  services: Vat;
  external: Vat;
};

const VAT_RATE = 25; // standard norsk MVA på tjenester og varer

function splitVat(gross: number): Vat {
  const net = gross / (1 + VAT_RATE / 100);
  return {
    gross: Math.round(gross),
    net: Math.round(net),
    vat: Math.round(gross - net),
  };
}

export async function getVatReport(r: Range): Promise<VatReport> {
  const [internal, external] = await Promise.all([
    fetchInternalSales(r),
    fetchExternalSales(r),
  ]);
  const svcGross = internal.reduce((a, s) => a + s.total_nok, 0);
  const extGross = external.reduce((a, s) => a + s.amount_nok, 0);
  return {
    rate: VAT_RATE,
    services: splitVat(svcGross),
    external: splitVat(extGross),
    total: splitVat(svcGross + extGross),
  };
}

/* ---------- 5) Hyllevarmere (tregt varelager) ---------- */

export type SlowRow = {
  name: string;
  stock: number;
  price: number;
  sold: number; // registrerte enheter solgt i perioden (sale_items kind=product)
};

/**
 * Produkter rangert etter lav omløpshastighet: aktive produkter (ikke gavekort),
 * sortert på solgte enheter i perioden (stigende), så høyt lager først.
 * Produktsalg registreres i dag primært via Zettle; itemisert enhetstelling
 * finnes bare der `sale_items` har produktlinjer, ellers vises 0 (ærlig).
 */
export async function getSlowMovers(r: Range): Promise<SlowRow[]> {
  try {
    const sb = await createClient();
    const { data: products } = await sb
      .from("products")
      .select("id, name, stock, price_nok, active, is_gift_card")
      .eq("active", true)
      .eq("is_gift_card", false)
      .limit(10000);

    // Enheter solgt per produkt i perioden (om produktlinjer finnes i sale_items).
    const sold = new Map<string, number>();
    try {
      const { data: items } = await sb
        .from("sale_items")
        .select("ref_id, quantity, kind, sales!inner(sold_at)")
        .eq("kind", "product")
        .gte("sales.sold_at", r.startIso)
        .lt("sales.sold_at", r.endIso)
        .limit(100000);
      for (const it of items ?? []) {
        if (!it.ref_id) continue;
        sold.set(it.ref_id as string, (sold.get(it.ref_id as string) ?? 0) + (Number(it.quantity) || 1));
      }
    } catch {
      // ingen produktlinjer – lar sold være 0
    }

    return (products ?? [])
      .map((p) => ({
        name: p.name as string,
        stock: Number(p.stock) || 0,
        price: Number(p.price_nok) || 0,
        sold: sold.get(p.id as string) ?? 0,
      }))
      .sort((a, b) => a.sold - b.sold || b.stock - a.stock)
      .slice(0, 50);
  } catch {
    return [];
  }
}
