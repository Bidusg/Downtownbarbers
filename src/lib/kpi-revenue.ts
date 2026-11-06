import { createClient } from "@/lib/supabase/server";
import { getHistoricalRevenue } from "@/lib/historical-revenue";
import { resolveRange, type Range } from "@/lib/report-queries";

/* =====================================================================
 * OMSETNING MED FILTRE (Nøkkeltall)
 *
 *   Kilde:   kassen (nytt system) · kassen + importert historikk (Fixit-
 *            måneder) · Fixit-kasseoppgjør (importert dagsoppgjør)
 *   Mva:     inkl. / eks. mva (25 % på både behandling og varer)
 *   Type:    alt · behandlinger · varesalg
 *   Barber, betalingsmåte, kanal (salong / nettbutikk)
 *
 *   Rabatt på et salg fordeles forholdsmessig på linjene, så behandling +
 *   varer + annet = salgets totalsum. Delbetaling fordeles etter beløp.
 *   Salg hentes i sider à 1000 (Supabase-taket), så lange perioder blir hele.
 * ===================================================================== */

export const MVA = 0.25;

export type RevSource = "kasse" | "historikk" | "fixit";
export type RevType = "alle" | "behandling" | "produkt";
export type RevMethod = "" | "kort" | "kontant" | "vipps" | "gavekort" | "annet";
export type RevChannel = "alle" | "salong" | "nett";

export type RevFilters = {
  source: RevSource;
  vat: "inkl" | "eks";
  type: RevType;
  barber: string; // staff_id eller ""
  method: RevMethod;
  channel: RevChannel;
};

export const DEFAULT_FILTERS: RevFilters = {
  source: "kasse",
  vat: "eks",
  type: "alle",
  barber: "",
  method: "",
  channel: "alle",
};

export function parseFilters(sp: Record<string, string | undefined>): RevFilters {
  const pick = <T extends string>(v: string | undefined, ok: readonly T[], d: T): T =>
    ok.includes(v as T) ? (v as T) : d;
  return {
    source: pick(sp.kilde, ["kasse", "historikk", "fixit"] as const, DEFAULT_FILTERS.source),
    vat: pick(sp.mva, ["inkl", "eks"] as const, DEFAULT_FILTERS.vat),
    type: pick(sp.type, ["alle", "behandling", "produkt"] as const, DEFAULT_FILTERS.type),
    barber: /^[0-9a-f-]{36}$/i.test(sp.barber ?? "") ? (sp.barber as string) : "",
    method: pick(sp.betaling, ["", "kort", "kontant", "vipps", "gavekort", "annet"] as const, ""),
    channel: pick(sp.kanal, ["alle", "salong", "nett"] as const, "alle"),
  };
}

export type RevTotals = {
  total: number;
  service: number;
  product: number;
  other: number;
  discount: number;
  /** Antall salg/besøk (null når kilden ikke har det, f.eks. Fixit-oppgjør). */
  count: number | null;
  avg: number | null;
  productPct: number;
};

export type RevReport = {
  filters: RevFilters;
  totals: RevTotals;
  prev: RevTotals;
  prevLabel: string;
  byBarber: { id: string; name: string; total: number; service: number; product: number; count: number }[];
  byMethod: { method: string; total: number }[];
  byDay: { date: string; total: number }[];
  notes: string[];
};

type Line = {
  date: string; // yyyy-mm-dd (Oslo)
  staffId: string | null;
  staffName: string;
  service: number;
  product: number;
  other: number;
  discount: number;
  /** Andel per betalingsmåte (sum = 1). */
  methods: { m: Exclude<RevMethod, "">; share: number }[];
  online: boolean;
  /** Teller som ett salg/besøk (0 for rader uten antall). */
  count: number;
};

const osloDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

function bucket(m: string | null | undefined): Exclude<RevMethod, ""> {
  const s = (m ?? "").toLowerCase();
  if (s.includes("kontant") || s === "cash") return "kontant";
  if (s.includes("kort") || s === "card" || s.includes("terminal")) return "kort";
  if (s.includes("vipps")) return "vipps";
  if (s.includes("gave") || s.includes("gift")) return "gavekort";
  return "annet";
}

const METHOD_LABEL: Record<Exclude<RevMethod, "">, string> = {
  kort: "Kort",
  kontant: "Kontant",
  vipps: "Vipps",
  gavekort: "Gavekort",
  annet: "Annet / ukjent",
};

/** Salg fra kassen, med linjer og betalinger, i sider à 1000. */
async function kasseLines(r: Range): Promise<Line[]> {
  const sb = await createClient();
  type Row = {
    id: string;
    sold_at: string;
    total_nok: number;
    discount_nok: number | null;
    payment_method: string | null;
    staff_id: string | null;
    booking_id: string | null;
    staff: { full_name?: string } | null;
    sale_items: { kind: string | null; quantity: number | null; price_nok: number | null }[] | null;
    sale_payments: { method: string; amount: number }[] | null;
  };
  const out: Line[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 200000; from += PAGE) {
    const first = await sb
      .from("sales")
      .select(
        "id, sold_at, total_nok, discount_nok, payment_method, staff_id, booking_id, staff(full_name), sale_items(kind, quantity, price_nok), sale_payments(method, amount)",
      )
      .gte("sold_at", r.startIso)
      .lt("sold_at", r.endIso)
      .order("sold_at")
      .order("id")
      .range(from, from + PAGE - 1);
    let data = first.data as unknown as Row[] | null;
    let error = first.error;
    if (error) {
      // Eldre database uten sale_payments/discount → enklere utvalg.
      const fb = await sb
        .from("sales")
        .select("id, sold_at, total_nok, payment_method, staff_id, booking_id, staff(full_name), sale_items(kind, quantity, price_nok)")
        .gte("sold_at", r.startIso)
        .lt("sold_at", r.endIso)
        .order("sold_at")
        .order("id")
        .range(from, from + PAGE - 1);
      data = fb.data as unknown as Row[] | null;
      error = fb.error;
    }
    if (error || !data) break;
    for (const s of data) {
      const total = Number(s.total_nok) || 0;
      const items = s.sale_items ?? [];
      let sv = 0, pr = 0, ot = 0;
      for (const it of items) {
        const v = (Number(it.quantity) || 1) * (Number(it.price_nok) || 0);
        if (it.kind === "product") pr += v;
        else if (it.kind === "service" || it.kind == null) sv += v;
        else ot += v; // frakt, justering o.l.
      }
      const gross = sv + pr + ot;
      let service: number, product: number, other: number;
      if (gross > 0) {
        const f = total / gross; // rabatt fordeles forholdsmessig
        service = sv * f;
        product = pr * f;
        other = ot * f;
      } else {
        service = total; // salg uten linjer (hurtigsalg) = behandling
        product = 0;
        other = 0;
      }
      const pays = (s.sale_payments ?? []).filter((p) => Number(p.amount) > 0);
      const paySum = pays.reduce((a, p) => a + Number(p.amount), 0);
      const methods =
        pays.length && paySum > 0
          ? pays.map((p) => ({ m: bucket(p.method), share: Number(p.amount) / paySum }))
          : [{ m: bucket(s.payment_method), share: 1 }];
      out.push({
        date: osloDay(s.sold_at),
        staffId: s.staff_id,
        staffName: s.staff?.full_name ?? (s.staff_id ? "Ukjent" : "Nettbutikk"),
        service,
        product,
        other,
        discount: Number(s.discount_nok) || 0,
        methods,
        online: !s.staff_id && !s.booking_id,
        count: 1,
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Importert historikk (Fixit-måneder per ansatt). Ingen dag/betaling. */
async function historyLines(r: Range): Promise<Line[]> {
  const hist = await getHistoricalRevenue(r.startIso, r.endIso);
  return hist.map((h) => {
    const service = h.treatmentNok || Math.max(0, h.totalNok - h.productNok);
    const product = h.productNok;
    return {
      date: `${h.month}-01`,
      staffId: h.staffId,
      staffName: h.staffName,
      service,
      product,
      other: Math.max(0, h.totalNok - service - product),
      discount: 0,
      methods: [{ m: "annet" as const, share: 1 }],
      online: false,
      count: h.visits,
    };
  });
}

/** Importert Fixit-kasseoppgjør (per dag, uten barber). */
async function fixitLines(r: Range): Promise<Line[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("fixit_settlements")
      .select("settle_date, treatment_nok, products_nok, total_nok, cash_nok, bankcard_nok, creditcard_nok, giftcard_nok, other_nok")
      .gte("settle_date", r.from)
      .lte("settle_date", r.to);
    if (error || !data) return [];
    return (data as Record<string, number | string>[]).map((x) => {
      const total = Number(x.total_nok) || 0;
      const parts = [
        { m: "kort" as const, v: (Number(x.bankcard_nok) || 0) + (Number(x.creditcard_nok) || 0) },
        { m: "kontant" as const, v: Number(x.cash_nok) || 0 },
        { m: "gavekort" as const, v: Number(x.giftcard_nok) || 0 },
        { m: "vipps" as const, v: Number(x.other_nok) || 0 },
      ].filter((p) => p.v > 0);
      const sum = parts.reduce((a, p) => a + p.v, 0);
      return {
        date: String(x.settle_date),
        staffId: null,
        staffName: "Fixit (uten barber)",
        service: Number(x.treatment_nok) || 0,
        product: Number(x.products_nok) || 0,
        other: Math.max(0, total - (Number(x.treatment_nok) || 0) - (Number(x.products_nok) || 0)),
        discount: 0,
        methods: sum > 0 ? parts.map((p) => ({ m: p.m, share: p.v / sum })) : [{ m: "annet" as const, share: 1 }],
        online: false,
        count: 0,
      };
    });
  } catch {
    return [];
  }
}

async function linesFor(r: Range, source: RevSource): Promise<Line[]> {
  if (source === "fixit") return fixitLines(r);
  const kasse = await kasseLines(r);
  if (source === "historikk") return [...kasse, ...(await historyLines(r))];
  return kasse;
}

function amountOf(l: Line, f: RevFilters): { total: number; service: number; product: number; other: number; weight: number } {
  const weight = f.method ? l.methods.filter((x) => x.m === f.method).reduce((a, x) => a + x.share, 0) : 1;
  const vat = f.vat === "eks" ? 1 / (1 + MVA) : 1;
  const k = weight * vat;
  const service = l.service * k;
  const product = l.product * k;
  const other = l.other * k;
  const total =
    f.type === "behandling" ? service : f.type === "produkt" ? product : service + product + other;
  return { total, service, product, other, weight };
}

function include(l: Line, f: RevFilters): boolean {
  if (f.barber && l.staffId !== f.barber) return false;
  if (f.channel === "nett" && !l.online) return false;
  if (f.channel === "salong" && l.online) return false;
  if (f.method && !l.methods.some((x) => x.m === f.method)) return false;
  if (f.type === "produkt" && l.product <= 0) return false;
  if (f.type === "behandling" && l.service <= 0) return false;
  return true;
}

function totalsOf(lines: Line[], f: RevFilters, hasCount: boolean): RevTotals {
  let total = 0, service = 0, product = 0, other = 0, discount = 0, count = 0;
  for (const l of lines) {
    if (!include(l, f)) continue;
    const a = amountOf(l, f);
    total += a.total;
    service += a.service;
    product += a.product;
    other += a.other;
    discount += l.discount * a.weight * (f.vat === "eks" ? 1 / (1 + MVA) : 1);
    count += l.count;
  }
  const all = service + product + other;
  return {
    total: Math.round(total),
    service: Math.round(service),
    product: Math.round(product),
    other: Math.round(other),
    discount: Math.round(discount),
    count: hasCount ? count : null,
    avg: hasCount && count > 0 ? Math.round(total / count) : null,
    productPct: all > 0 ? Math.round((product / all) * 1000) / 10 : 0,
  };
}

/** Like lang periode rett før. */
function previousRange(r: Range): Range {
  const day = 86400000;
  const from = Date.parse(r.from + "T00:00:00Z");
  const to = Date.parse(r.to + "T00:00:00Z");
  const len = Math.round((to - from) / day) + 1;
  const pTo = new Date(from - day).toISOString().slice(0, 10);
  const pFrom = new Date(from - len * day).toISOString().slice(0, 10);
  return resolveRange(pFrom, pTo);
}

export async function getRevenueReport(r: Range, f: RevFilters): Promise<RevReport> {
  const prevR = previousRange(r);
  const [lines, prevLines] = await Promise.all([linesFor(r, f.source), linesFor(prevR, f.source)]);
  const hasCount = f.source !== "fixit";
  const notes: string[] = [];
  if (f.source === "fixit") {
    notes.push("Fixit-kasseoppgjøret har ikke barber eller antall salg – barberfilter og snitt per salg gjelder ikke.");
    if (lines.length === 0) notes.push("Ingen Fixit-oppgjør er importert for perioden (Kasseoppgjør → Importer fra Fixit).");
  }
  if (f.source === "historikk") {
    notes.push("Importert historikk er månedssummer per barber – den har ikke betalingsmåte eller dag (føres på den 1. i måneden).");
  }

  const byBarberMap = new Map<string, RevReport["byBarber"][number]>();
  const byMethodMap = new Map<string, number>();
  const byDayMap = new Map<string, number>();
  for (const l of lines) {
    if (!include(l, f)) continue;
    const a = amountOf(l, f);
    const key = l.staffId ?? l.staffName;
    const b = byBarberMap.get(key) ?? { id: key, name: l.staffName, total: 0, service: 0, product: 0, count: 0 };
    b.total += a.total;
    b.service += a.service;
    b.product += a.product;
    b.count += l.count;
    byBarberMap.set(key, b);
    for (const m of l.methods) {
      if (f.method && m.m !== f.method) continue;
      const share = f.method ? 1 : m.share;
      byMethodMap.set(m.m, (byMethodMap.get(m.m) ?? 0) + a.total * share);
    }
    byDayMap.set(l.date, (byDayMap.get(l.date) ?? 0) + a.total);
  }

  return {
    filters: f,
    totals: totalsOf(lines, f, hasCount),
    prev: totalsOf(prevLines, f, hasCount),
    prevLabel: prevR.label,
    byBarber: [...byBarberMap.values()]
      .map((b) => ({ ...b, total: Math.round(b.total), service: Math.round(b.service), product: Math.round(b.product) }))
      .sort((a, b) => b.total - a.total),
    byMethod: [...byMethodMap]
      .map(([m, total]) => ({ method: METHOD_LABEL[m as Exclude<RevMethod, "">] ?? m, total: Math.round(total) }))
      .filter((x) => x.total !== 0)
      .sort((a, b) => b.total - a.total),
    byDay: [...byDayMap]
      .map(([date, total]) => ({ date, total: Math.round(total) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    notes,
  };
}
