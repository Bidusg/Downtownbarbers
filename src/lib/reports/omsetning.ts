import { fetchAll, fetchAllSafe } from "@/lib/reports/fetch-all";
import { resolveRange, type Range } from "@/lib/report-queries";
import type { Cell, Column, Kpi, ReportDef, ReportSheet, Supa, Table } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTSENTER – OMSETNING
 *   Felles salgsgrunnlag (loadSales) brukes også av barbere.ts og kasse.ts.
 *
 *   Regler:
 *   - Alle priser i databasen er inkl. 25 % mva. Eks. mva = inkl / 1,25.
 *   - Annullerte salg er allerede slettet fra `sales` av RPC void_sale
 *     (kopi ligger i sale_voids), så de er aldri med her.
 *   - Salg av gavekort ligger i `gift_cards`, ikke i `sales`. De er forskudd
 *     (konto 2900) og er derfor aldri en del av omsetningen. Innløsning av
 *     gavekort er vanlig salg i `sales` (betalt med «Gavekort») og telles med.
 *   - Rabatt på et salg fordeles forholdsmessig på linjene (som kpi-revenue.ts).
 *   - Alt grupperes på Oslo-dag, ikke UTC-dag.
 *   - Salg hentes i sider à 1000 (PostgREST-taket) via fetchAll.
 * ===================================================================== */

export const MVA = 0.25;
const OSLO = "Europe/Oslo";

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const eksMva = (inkl: number) => r2(inkl / (1 + MVA));
export const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
export const BARBER_NETT = "Nettbutikk (uten barber)";

/* ---------------------------- Datohjelpere ---------------------------- */

const osloFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: OSLO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

/** Oslo-dag (yyyy-mm-dd) og time (0–23) for et UTC-tidspunkt. */
export function osloDayHour(iso: string): { day: string; hour: number } {
  const p: Record<string, string> = {};
  for (const x of osloFmt.formatToParts(new Date(iso))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Alle datoer fra..til (begge inkludert). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 4000; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Ukedag mandag=0 … søndag=6 for en kalenderdato. */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** ISO-uke for en kalenderdato: nøkkel «2026-W45» og mandagen i uka. */
export function isoWeekOf(day: string): { key: string; monday: string } {
  const wd = weekdayOf(day);
  const monday = addDays(day, -wd);
  const thursday = new Date(`${addDays(day, 3 - wd)}T00:00:00Z`);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.floor((thursday.getTime() - jan1.getTime()) / 86400000 / 7) + 1;
  return { key: `${isoYear}-W${String(week).padStart(2, "0")}`, monday };
}

/** Like lang periode rett før. */
export function previousRange(r: Range): Range {
  const len = eachDay(r.from, r.to).length;
  return resolveRange(addDays(r.from, -len), addDays(r.from, -1));
}

/* ---------------------------- Betalingsmåte ---------------------------- */

export type Bucket = "kort" | "kontant" | "vipps" | "gavekort" | "annet";
export const BUCKETS: Bucket[] = ["kort", "kontant", "vipps", "gavekort", "annet"];
export const BUCKET_LABEL: Record<Bucket, string> = {
  kort: "Kort",
  kontant: "Kontant",
  vipps: "Vipps",
  gavekort: "Gavekort",
  annet: "Annet / ukjent",
};

export function bucketOf(m: string | null | undefined): Bucket {
  const s = (m ?? "").toLowerCase();
  if (s.includes("kontant") || s === "cash") return "kontant";
  if (s.includes("kort") && s.includes("gave")) return "gavekort";
  if (s.includes("gave") || s.includes("gift")) return "gavekort";
  if (s.includes("kort") || s === "card" || s.includes("terminal")) return "kort";
  if (s.includes("vipps")) return "vipps";
  return "annet";
}

/* ---------------------------- Salgsgrunnlag ---------------------------- */

export type LineRec = {
  kind: "service" | "product" | "other";
  name: string;
  category: string;
  qty: number;
  /** Før rabatt, inkl. mva. */
  gross: number;
  /** Etter forholdsmessig rabatt, inkl. mva. */
  net: number;
};

export type SaleRec = {
  id: string;
  soldAt: string;
  day: string;
  hour: number;
  weekday: number;
  month: string; // yyyy-mm
  staffId: string | null;
  staffName: string;
  customer: string;
  online: boolean;
  total: number;
  discount: number;
  svc: number; // behandlingsomsetning etter rabatt, inkl. mva
  prod: number;
  oth: number;
  nSvc: number; // antall behandlinger
  nProd: number; // antall varer (stk)
  lines: LineRec[];
  pays: { m: Bucket; raw: string; amount: number }[];
};

export type SalesData = { sales: SaleRec[]; notes: string[] };

type RawItem = {
  kind: string | null;
  ref_id: string | null;
  description: string | null;
  quantity: number | null;
  price_nok: number | null;
};
type RawSale = {
  id: string;
  sold_at: string;
  total_nok: number | null;
  discount_nok?: number | null;
  payment_method: string | null;
  staff_id: string | null;
  booking_id: string | null;
  customer_id?: string | null;
  customers?: { full_name?: string | null } | null;
  sale_items: RawItem[] | null;
  sale_payments?: { method: string; amount: number }[] | null;
};

const ITEMS = "sale_items(kind, ref_id, description, quantity, price_nok)";
const SELECTS: { sel: string; note?: string }[] = [
  {
    sel: `id, sold_at, total_nok, discount_nok, payment_method, staff_id, booking_id, customer_id, customers(full_name), ${ITEMS}, sale_payments(method, amount)`,
  },
  {
    sel: `id, sold_at, total_nok, payment_method, staff_id, booking_id, customer_id, customers(full_name), ${ITEMS}, sale_payments(method, amount)`,
    note: "Kolonnen sales.discount_nok mangler i databasen – rabatt vises som 0.",
  },
  {
    sel: `id, sold_at, total_nok, payment_method, staff_id, booking_id, ${ITEMS}`,
    note: "Tabellen sale_payments eller kundekobling mangler – delbetalinger og kundenavn vises ikke, rabatt som 0.",
  },
];

const memo = new WeakMap<object, Map<string, Promise<SalesData>>>();

/** Alle salg i perioden (cachet per rapportkjøring), med linjer, betalinger og navn. */
export function loadSales(sb: Supa, r: Range): Promise<SalesData> {
  let m = memo.get(sb);
  if (!m) {
    m = new Map();
    memo.set(sb, m);
  }
  const key = `${r.startIso}|${r.endIso}`;
  let p = m.get(key);
  if (!p) {
    p = loadSalesUncached(sb, r);
    m.set(key, p);
  }
  return p;
}

async function loadSalesUncached(sb: Supa, r: Range): Promise<SalesData> {
  const notes: string[] = [];
  let raw: RawSale[] | null = null;
  for (const t of SELECTS) {
    try {
      raw = await fetchAll<RawSale>(
        (from, to) =>
          sb
            .from("sales")
            .select(t.sel)
            .gte("sold_at", r.startIso)
            .lt("sold_at", r.endIso)
            .order("sold_at")
            .order("id")
            .range(from, to) as unknown as PromiseLike<{ data: RawSale[] | null; error: { message: string } | null }>,
      );
      if (t.note) notes.push(t.note);
      break;
    } catch {
      /* prøv enklere utvalg */
    }
  }
  if (!raw) {
    return { sales: [], notes: ["Kunne ikke lese salg (tabellen sales)."] };
  }

  const [staffRows, svcRows, catRows] = await Promise.all([
    fetchAllSafe<{ id: string; full_name: string | null }>(
      (from, to) =>
        sb.from("staff").select("id, full_name").order("id").range(from, to) as unknown as PromiseLike<{
          data: { id: string; full_name: string | null }[] | null;
          error: { message: string } | null;
        }>,
    ),
    fetchAllSafe<{ id: string; name: string | null; category_id: string | null }>(
      (from, to) =>
        sb.from("services").select("id, name, category_id").order("id").range(from, to) as unknown as PromiseLike<{
          data: { id: string; name: string | null; category_id: string | null }[] | null;
          error: { message: string } | null;
        }>,
    ),
    fetchAllSafe<{ id: string; name: string | null }>(
      (from, to) =>
        sb.from("service_categories").select("id, name").order("id").range(from, to) as unknown as PromiseLike<{
          data: { id: string; name: string | null }[] | null;
          error: { message: string } | null;
        }>,
    ),
  ]);
  const staffName = new Map(staffRows.map((s) => [s.id, s.full_name ?? "Ukjent"]));
  const catName = new Map(catRows.map((c) => [c.id, c.name ?? "Uten kategori"]));
  const svc = new Map(
    svcRows.map((s) => [
      s.id,
      { name: s.name ?? "Ukjent tjeneste", category: (s.category_id && catName.get(s.category_id)) || "Uten kategori" },
    ]),
  );

  const sales: SaleRec[] = raw.map((s) => {
    const total = Number(s.total_nok) || 0;
    const items = s.sale_items ?? [];
    const lines: LineRec[] = [];
    let sv = 0, pr = 0, ot = 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 1;
      const gross = qty * (Number(it.price_nok) || 0);
      if (it.kind === "product") {
        pr += gross;
        lines.push({ kind: "product", name: it.description || "Vare", category: "Varer", qty, gross, net: gross });
      } else if (it.kind === "service" || it.kind == null) {
        sv += gross;
        const info = it.ref_id ? svc.get(it.ref_id) : undefined;
        lines.push({
          kind: "service",
          name: info?.name ?? (it.description || "Ukjent tjeneste"),
          category: info?.category ?? "Uten kategori",
          qty,
          gross,
          net: gross,
        });
      } else {
        ot += gross;
        lines.push({ kind: "other", name: it.description || it.kind || "Annet", category: "Annet", qty, gross, net: gross });
      }
    }
    const grossAll = sv + pr + ot;
    let svcN: number, prodN: number, othN: number;
    if (grossAll > 0) {
      const f = total / grossAll; // rabatt fordeles forholdsmessig
      svcN = sv * f;
      prodN = pr * f;
      othN = ot * f;
      for (const l of lines) l.net = l.gross * f;
    } else {
      // Salg uten linjer (hurtigsalg) = behandling, som i kpi-revenue.ts.
      svcN = total;
      prodN = 0;
      othN = 0;
      if (total > 0) {
        lines.push({
          kind: "service",
          name: "Uten salgslinje (hurtigsalg)",
          category: "Uten kategori",
          qty: 1,
          gross: total,
          net: total,
        });
      }
    }
    const nSvc = lines.filter((l) => l.kind === "service").reduce((a, l) => a + l.qty, 0);
    const nProd = lines.filter((l) => l.kind === "product").reduce((a, l) => a + l.qty, 0);

    const payRows = (s.sale_payments ?? []).filter((p) => Number(p.amount) > 0);
    const pays =
      payRows.length > 0
        ? payRows.map((p) => ({ m: bucketOf(p.method), raw: p.method, amount: Number(p.amount) }))
        : [{ m: bucketOf(s.payment_method), raw: s.payment_method ?? "", amount: total }];

    const { day, hour } = osloDayHour(s.sold_at);
    return {
      id: s.id,
      soldAt: s.sold_at,
      day,
      hour,
      weekday: weekdayOf(day),
      month: day.slice(0, 7),
      staffId: s.staff_id,
      staffName: s.staff_id ? staffName.get(s.staff_id) ?? "Ukjent" : BARBER_NETT,
      customer: s.customers?.full_name?.trim() || "",
      online: !s.staff_id && !s.booking_id,
      total,
      discount: Number(s.discount_nok) || 0,
      svc: svcN,
      prod: prodN,
      oth: othN,
      nSvc,
      nProd,
      lines,
      pays,
    };
  });
  return { sales, notes };
}

/* ---------------------------- Aggregering ---------------------------- */

export type Agg = {
  n: number;
  nSvc: number;
  nProd: number;
  discount: number;
  total: number;
  svc: number;
  prod: number;
};
export const emptyAgg = (): Agg => ({ n: 0, nSvc: 0, nProd: 0, discount: 0, total: 0, svc: 0, prod: 0 });
export function addSale(a: Agg, s: SaleRec): Agg {
  a.n += 1;
  a.nSvc += s.nSvc;
  a.nProd += s.nProd;
  a.discount += s.discount;
  a.total += s.total;
  a.svc += s.svc;
  a.prod += s.prod;
  return a;
}
export function groupBy(sales: SaleRec[], keyFn: (s: SaleRec) => string): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const s of sales) {
    const k = keyFn(s);
    m.set(k, addSale(m.get(k) ?? emptyAgg(), s));
  }
  return m;
}

const kr = (n: number) => `${Math.round(n).toLocaleString("nb-NO")} kr`;

function pctChange(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "uendret" : "ny";
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1).replace(".", ",")} %`;
}

/** Kolonnesett som deles av dag-/måned-/ukerapportene. */
function periodCols(first: Column): Column[] {
  return [
    first,
    { key: "salg", header: "Antall salg", type: "int", total: "sum" },
    { key: "beh", header: "Behandlinger (stk)", type: "int", total: "sum" },
    { key: "varer", header: "Varer (stk)", type: "int", total: "sum" },
    { key: "rabatt", header: "Rabatt gitt (inkl. mva)", type: "money", total: "sum" },
    { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
    { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
    { key: "mva", header: "Mva 25 %", type: "money", total: "sum" },
  ];
}
function periodRow(label: Record<string, Cell>, a: Agg): Record<string, Cell> {
  const inkl = r2(a.total);
  const eks = eksMva(inkl);
  return {
    ...label,
    salg: a.n,
    beh: a.nSvc,
    varer: a.nProd,
    rabatt: r2(a.discount),
    inkl,
    eks,
    mva: r2(inkl - eks),
  };
}

const NOTE_MVA =
  "Alle beløp er etter rabatt. Priser i systemet er inkl. 25 % mva; eks. mva = inkl. mva / 1,25. Annullerte salg og salg av gavekort (forskudd, konto 2900) er ikke med.";

/* ------------------------------ Rapporter ------------------------------ */

async function sammendrag({ range, sb }: { range: Range; sb: Supa }): Promise<ReportSheet[]> {
  const prevR = previousRange(range);
  const [cur, prev] = await Promise.all([loadSales(sb, range), loadSales(sb, prevR)]);
  const sum = (sales: SaleRec[]) => [...sales].reduce((a, s) => addSale(a, s), emptyAgg());
  const a = sum(cur.sales);
  const p = sum(prev.sales);
  const inkl = r2(a.total);
  const pInkl = r2(p.total);
  const prevTxt = (v: string, c: number, pr: number) => `forrige periode (${prevR.label}): ${v} (${pctChange(c, pr)})`;

  const kpis: Kpi[] = [
    { label: "Omsetning inkl. mva", value: inkl, type: "money", hint: prevTxt(kr(pInkl), inkl, pInkl) },
    {
      label: "Omsetning eks. mva",
      value: eksMva(inkl),
      type: "money",
      hint: prevTxt(kr(eksMva(pInkl)), eksMva(inkl), eksMva(pInkl)),
    },
    { label: "Antall salg", value: a.n, type: "int", hint: prevTxt(String(p.n), a.n, p.n) },
    {
      label: "Snitt per salg (inkl. mva)",
      value: a.n ? r2(a.total / a.n) : null,
      type: "money2",
      hint: prevTxt(p.n ? kr(p.total / p.n) : "–", a.n ? a.total / a.n : 0, p.n ? p.total / p.n : 0),
    },
    {
      label: "Rabatter gitt (inkl. mva)",
      value: r2(a.discount),
      type: "money",
      hint: prevTxt(kr(p.discount), a.discount, p.discount),
    },
    { label: "Behandlinger (omsetning inkl. mva)", value: r2(a.svc), type: "money", hint: `${a.nSvc} stk` },
    { label: "Varer (omsetning inkl. mva)", value: r2(a.prod), type: "money", hint: `${a.nProd} stk` },
    {
      label: "Varer som andel av omsetning",
      value: a.total > 0 ? a.prod / a.total : null,
      type: "pct",
      hint: `forrige periode: ${p.total > 0 ? ((p.prod / p.total) * 100).toFixed(1).replace(".", ",") + " %" : "–"}`,
    },
  ];

  const typeRows = [
    { type: "Behandlinger", stk: a.nSvc, inkl: r2(a.svc) },
    { type: "Varer", stk: a.nProd, inkl: r2(a.prod) },
    { type: "Annet (frakt, justering m.m.)", stk: null, inkl: r2(Math.max(0, a.total - a.svc - a.prod)) },
  ].map((x) => ({
    type: x.type,
    stk: x.stk,
    inkl: x.inkl,
    eks: eksMva(x.inkl),
    andel: a.total > 0 ? x.inkl / a.total : null,
  }));

  const cmp = (label: string, c: number, pr: number): Record<string, Cell> => ({
    nokkel: label,
    naa: r2(c),
    forrige: r2(pr),
    endring: r2(c - pr),
    endringPct: pr !== 0 ? (c - pr) / pr : null,
  });

  const tables: Table[] = [
    {
      title: "Behandlinger mot varer",
      columns: [
        { key: "type", header: "Type", type: "text" },
        { key: "stk", header: "Antall (stk)", type: "int" },
        { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
        { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
        { key: "andel", header: "Andel", type: "pct", total: "sum" },
      ],
      rows: typeRows,
      note: NOTE_MVA,
    },
    {
      title: `Sammenligning med forrige periode (${prevR.label})`,
      columns: [
        { key: "nokkel", header: "Nøkkeltall (kr)", type: "text" },
        { key: "naa", header: range.label, type: "money" },
        { key: "forrige", header: prevR.label, type: "money" },
        { key: "endring", header: "Endring", type: "money" },
        { key: "endringPct", header: "Endring i %", type: "pct" },
      ],
      rows: [
        cmp("Omsetning inkl. mva", a.total, p.total),
        cmp("Omsetning eks. mva", eksMva(a.total), eksMva(p.total)),
        cmp("Mva 25 %", a.total - eksMva(a.total), p.total - eksMva(p.total)),
        cmp("Behandlinger inkl. mva", a.svc, p.svc),
        cmp("Varer inkl. mva", a.prod, p.prod),
        cmp("Rabatter gitt", a.discount, p.discount),
        cmp("Snitt per salg inkl. mva", a.n ? a.total / a.n : 0, p.n ? p.total / p.n : 0),
      ],
      note: `Forrige periode er like lang og ligger rett før (${prevR.from} til ${prevR.to}).`,
    },
  ];
  const notes = [...new Set([...cur.notes, ...prev.notes])];
  if (notes.length) tables[1].note += " " + notes.join(" ");
  return [
    {
      name: "Omsetning sammendrag",
      title: "Omsetning – sammendrag",
      subtitle: range.label,
      kpis,
      tables,
    },
  ];
}

async function perDag({ range, sb }: { range: Range; sb: Supa }): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const byDay = groupBy(sales, (s) => s.day);
  const rows = eachDay(range.from, range.to).map((d) =>
    periodRow({ dato: d, ukedag: WEEKDAYS[weekdayOf(d)] }, byDay.get(d) ?? emptyAgg()),
  );
  const cols = periodCols({ key: "dato", header: "Dato", type: "date" });
  cols.splice(1, 0, { key: "ukedag", header: "Ukedag", type: "text" });
  return [
    {
      name: "Omsetning per dag",
      title: "Omsetning per dag",
      subtitle: range.label,
      tables: [{ columns: cols, rows, note: [NOTE_MVA, "Dager uten salg er tatt med (0).", ...notes].join(" ") }],
    },
  ];
}

async function perManed({ range, sb }: { range: Range; sb: Supa }): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const days = eachDay(range.from, range.to);
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const byMonth = groupBy(sales, (s) => s.month);
  const monthCols = periodCols({ key: "maned", header: "Måned", type: "text" });
  monthCols.push({ key: "snitt", header: "Snitt per salg (inkl. mva)", type: "money2" });
  const monthRows = months.map((m) => {
    const a = byMonth.get(m) ?? emptyAgg();
    return { ...periodRow({ maned: m }, a), snitt: a.n ? r2(a.total / a.n) : null };
  });

  const weekOf = new Map<string, { key: string; monday: string }>();
  for (const d of days) weekOf.set(d, isoWeekOf(d));
  const weeks = [...new Map([...weekOf.values()].map((w) => [w.key, w])).values()];
  const byWeek = groupBy(sales, (s) => (weekOf.get(s.day) ?? isoWeekOf(s.day)).key);
  const weekCols = periodCols({ key: "uke", header: "ISO-uke", type: "text" });
  weekCols.splice(1, 0, { key: "mandag", header: "Mandag i uka", type: "date" });
  weekCols.push({ key: "snitt", header: "Snitt per salg (inkl. mva)", type: "money2" });
  const weekRows = weeks.map((w) => {
    const a = byWeek.get(w.key) ?? emptyAgg();
    return { ...periodRow({ uke: w.key, mandag: w.monday }, a), snitt: a.n ? r2(a.total / a.n) : null };
  });

  return [
    {
      name: "Omsetning per måned",
      title: "Omsetning per måned og uke",
      subtitle: range.label,
      tables: [
        { title: "Per måned", columns: monthCols, rows: monthRows, note: [NOTE_MVA, ...notes].join(" ") },
        {
          title: "Per ISO-uke",
          columns: weekCols,
          rows: weekRows,
          note: "Uker som stikker utenfor perioden (første/siste uke) viser bare salg innenfor perioden.",
        },
      ],
    },
  ];
}

async function ukedagTime({ range, sb }: { range: Range; sb: Supa }): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const total = sales.reduce((a, s) => a + s.total, 0);
  const days = eachDay(range.from, range.to);

  const byWd = groupBy(sales, (s) => String(s.weekday));
  const wdCount = new Array(7).fill(0) as number[];
  for (const d of days) wdCount[weekdayOf(d)]++;
  const wdRows = WEEKDAYS.map((name, i) => {
    const a = byWd.get(String(i)) ?? emptyAgg();
    return {
      ukedag: name,
      dager: wdCount[i],
      salg: a.n,
      inkl: r2(a.total),
      eks: eksMva(a.total),
      snittDag: wdCount[i] ? r2(a.total / wdCount[i]) : null,
      snittSalg: a.n ? r2(a.total / a.n) : null,
      andel: total > 0 ? a.total / total : null,
    };
  });

  const byHour = groupBy(sales, (s) => String(s.hour));
  const hoursWith = [...byHour.keys()].map(Number);
  const lo = hoursWith.length ? Math.min(...hoursWith) : 0;
  const hi = hoursWith.length ? Math.max(...hoursWith) : -1;
  const hourRows: Record<string, Cell>[] = [];
  for (let h = lo; h <= hi; h++) {
    const a = byHour.get(String(h)) ?? emptyAgg();
    hourRows.push({
      time: `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59`,
      salg: a.n,
      inkl: r2(a.total),
      eks: eksMva(a.total),
      snittSalg: a.n ? r2(a.total / a.n) : null,
      andel: total > 0 ? a.total / total : null,
    });
  }

  return [
    {
      name: "Ukedag og time",
      title: "Omsetning per ukedag og time",
      subtitle: range.label,
      tables: [
        {
          title: "Per ukedag",
          columns: [
            { key: "ukedag", header: "Ukedag", type: "text" },
            { key: "dager", header: "Antall dager i perioden", type: "int", total: "sum" },
            { key: "salg", header: "Antall salg", type: "int", total: "sum" },
            { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
            { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
            { key: "snittDag", header: "Snitt per dag (inkl. mva)", type: "money2" },
            { key: "snittSalg", header: "Snitt per salg (inkl. mva)", type: "money2" },
            { key: "andel", header: "Andel av omsetning", type: "pct", total: "sum" },
          ],
          rows: wdRows,
          note: [NOTE_MVA, ...notes].join(" "),
        },
        {
          title: "Per time på døgnet (Oslo-tid)",
          columns: [
            { key: "time", header: "Time", type: "text" },
            { key: "salg", header: "Antall salg", type: "int", total: "sum" },
            { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
            { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
            { key: "snittSalg", header: "Snitt per salg (inkl. mva)", type: "money2" },
            { key: "andel", header: "Andel av omsetning", type: "pct", total: "sum" },
          ],
          rows: hourRows,
          note: "Tidspunktet er når salget ble registrert (sold_at). Timer uten salg utenfor første/siste time med salg er utelatt. Salg som er etterregistrert fra tidligere dag står på timens starttid.",
        },
      ],
    },
  ];
}

async function tjenester({ range, sb }: { range: Range; sb: Supa }): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  type S = { name: string; category: string; qty: number; net: number };
  const bySvc = new Map<string, S>();
  const byCat = new Map<string, { qty: number; net: number }>();
  let total = 0;
  for (const s of sales) {
    for (const l of s.lines) {
      if (l.kind !== "service") continue;
      const k = `${l.category}|${l.name}`;
      const e = bySvc.get(k) ?? { name: l.name, category: l.category, qty: 0, net: 0 };
      e.qty += l.qty;
      e.net += l.net;
      bySvc.set(k, e);
      const c = byCat.get(l.category) ?? { qty: 0, net: 0 };
      c.qty += l.qty;
      c.net += l.net;
      byCat.set(l.category, c);
      total += l.net;
    }
  }
  const svcRows = [...bySvc.values()]
    .sort((a, b) => b.net - a.net)
    .map((e) => ({
      tjeneste: e.name,
      kategori: e.category,
      antall: e.qty,
      inkl: r2(e.net),
      eks: eksMva(e.net),
      snitt: e.qty ? r2(e.net / e.qty) : null,
      andel: total > 0 ? e.net / total : null,
    }));
  const catRows = [...byCat.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .map(([kat, e]) => ({
      kategori: kat,
      antall: e.qty,
      inkl: r2(e.net),
      eks: eksMva(e.net),
      snitt: e.qty ? r2(e.net / e.qty) : null,
      andel: total > 0 ? e.net / total : null,
    }));
  const note =
    "Bare behandlinger (varer er ikke med). Beløp er etter forholdsmessig rabatt, inkl. mva. Snitt = omsetning / antall utførte. " +
    notes.join(" ");
  return [
    {
      name: "Tjenester",
      title: "Omsetning per tjeneste og kategori",
      subtitle: range.label,
      tables: [
        {
          title: "Per kategori",
          columns: [
            { key: "kategori", header: "Kategori", type: "text" },
            { key: "antall", header: "Antall", type: "int", total: "sum" },
            { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
            { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
            { key: "snitt", header: "Snitt per stk (inkl. mva)", type: "money2" },
            { key: "andel", header: "Andel", type: "pct", total: "sum" },
          ],
          rows: catRows,
          note,
        },
        {
          title: "Per tjeneste",
          columns: [
            { key: "tjeneste", header: "Tjeneste", type: "text", width: 34 },
            { key: "kategori", header: "Kategori", type: "text" },
            { key: "antall", header: "Antall", type: "int", total: "sum" },
            { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
            { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
            { key: "snitt", header: "Snitt per stk (inkl. mva)", type: "money2" },
            { key: "andel", header: "Andel", type: "pct", total: "sum" },
          ],
          rows: svcRows,
        },
      ],
    },
  ];
}

type GiftRow = { id: string; initial_nok: number | null; created_at: string };

async function mvaSammendrag({ range, sb }: { range: Range; sb: Supa }): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const days = eachDay(range.from, range.to);
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const mvaRow = (label: Record<string, Cell>, a: Agg) => {
    const brutto = r2(a.total);
    const grunnlag = eksMva(brutto);
    return { ...label, salg: a.n, brutto, grunnlag, mva: r2(brutto - grunnlag) };
  };
  const cols = (first: Column): Column[] => [
    first,
    { key: "salg", header: "Antall salg", type: "int", total: "sum" },
    { key: "grunnlag", header: "Grunnlag eks. mva", type: "money", total: "sum" },
    { key: "mva", header: "Mva 25 %", type: "money", total: "sum" },
    { key: "brutto", header: "Brutto inkl. mva", type: "money", total: "sum" },
  ];
  const byDay = groupBy(sales, (s) => s.day);
  const byMonth = groupBy(sales, (s) => s.month);
  const all = sales.reduce((a, s) => addSale(a, s), emptyAgg());
  const tot = mvaRow({}, all);

  // Gavekort solgt i perioden = forskudd (konto 2900), ikke omsetning, ikke mva.
  const gifts = await fetchAllSafe<GiftRow>(
    (from, to) =>
      sb
        .from("gift_cards")
        .select("id, initial_nok, created_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: GiftRow[] | null; error: { message: string } | null }>,
  );
  const giftSum = r2(gifts.reduce((a, g) => a + (Number(g.initial_nok) || 0), 0));

  const kpis: Kpi[] = [
    { label: "Grunnlag eks. mva", value: tot.grunnlag, type: "money" },
    { label: "Utgående mva 25 %", value: tot.mva, type: "money" },
    { label: "Brutto inkl. mva", value: tot.brutto, type: "money" },
    {
      label: "Gavekort solgt (forskudd, ikke omsetning)",
      value: giftSum,
      type: "money",
      hint: `${gifts.length} kort – konto 2900, uten mva`,
    },
  ];
  const note =
    "Mva beregnes som brutto − brutto/1,25 (25 % på både behandlinger og varer). Salg av gavekort er forskudd fra kunder (konto 2900) og er holdt utenfor; mva tas når gavekortet innløses (da er det vanlig salg betalt med «Gavekort» og er med her). Annullerte salg er ikke med. Obs: tilgodelapper fra nettordre-returer (gift_cards med kode «DB-…») kan ikke skilles fra vanlige gavekort i databasen og er derfor regnet med i «Gavekort solgt».";
  return [
    {
      name: "MVA",
      title: "MVA-oppsummering",
      subtitle: range.label,
      kpis,
      tables: [
        { title: "Per måned", columns: cols({ key: "maned", header: "Måned", type: "text" }), rows: months.map((m) => mvaRow({ maned: m }, byMonth.get(m) ?? emptyAgg())), note: [note, ...notes].join(" ") },
        { title: "Per dag", columns: cols({ key: "dato", header: "Dato", type: "date" }), rows: days.map((d) => mvaRow({ dato: d }, byDay.get(d) ?? emptyAgg())) },
      ],
    },
  ];
}

export const REPORTS: ReportDef[] = [
  {
    key: "omsetning-sammendrag",
    title: "Omsetning – sammendrag",
    description: "Omsetning inkl. og eks. mva, antall salg, snitt, rabatter og behandlinger mot varer, med sammenligning mot forrige periode.",
    category: "Omsetning",
    build: sammendrag,
  },
  {
    key: "omsetning-dag",
    title: "Omsetning per dag",
    description: "Én rad per dag (også dager uten salg) med salg, behandlinger, varer, rabatt, omsetning og mva.",
    category: "Omsetning",
    build: perDag,
  },
  {
    key: "omsetning-maned",
    title: "Omsetning per måned og uke",
    description: "Omsetning, antall salg og mva per måned og per ISO-uke.",
    category: "Omsetning",
    build: perManed,
  },
  {
    key: "omsetning-ukedag-time",
    title: "Omsetning per ukedag og time",
    description: "Hvilke ukedager og klokkeslett som gir mest omsetning, med andel av total.",
    category: "Omsetning",
    build: ukedagTime,
  },
  {
    key: "omsetning-tjenester",
    title: "Omsetning per tjeneste og kategori",
    description: "Antall, omsetning, snittpris og andel per tjeneste og per tjenestekategori.",
    category: "Omsetning",
    build: tjenester,
  },
  {
    key: "omsetning-mva",
    title: "MVA-oppsummering",
    description: "Grunnlag, utgående mva 25 % og brutto per måned og dag. Gavekortsalg holdes utenfor (forskudd, konto 2900).",
    category: "Omsetning",
    build: mvaSammendrag,
  },
];
