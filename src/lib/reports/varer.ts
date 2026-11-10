import { fetchAll } from "@/lib/reports/fetch-all";
import type { Cell, Column, ReportContext, ReportDef, ReportSheet, Supa } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTER: VARER
 *   Priser i databasen er INKL. 25 % mva. Innkjøpspris (product_costs.cost_nok)
 *   er EKS. mva per enhet. Mangler tabellen product_costs (SQL ikke kjørt),
 *   eksporteres rapportene likevel – uten innkjøpstall og med forklaring.
 *   Salg: annullerte salg slettes fra `sales` av void_sale (kopi i
 *   sale_voids), så alle rader i `sales` er gyldige salg. Rabatt fordeles
 *   forholdsmessig på linjene (som i kpi-revenue.ts).
 * ===================================================================== */

const MVA = 0.25;
const COST_SQL_NOTE =
  "Innkjøpspris mangler: kjør KJØR-I-SUPABASE-INNKJOPSPRIS.sql i Supabase og legg inn innkjøpspriser under Admin > Produkter.";

type Prod = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  active: boolean;
  online: boolean;
  stock: number;
  price: number; // inkl. mva
  isGift: boolean;
};
type Cost = { cost: number; supplier: string | null; sku: string | null };

const osloDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

type ProdRow = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  barcode: string | null;
  active: boolean;
  online?: boolean | null;
  slug?: string | null;
  stock: number | null;
  price_nok: number | string | null;
  is_gift_card: boolean | null;
};

async function loadProducts(sb: Supa): Promise<Prod[]> {
  const map = (r: ProdRow): Prod => ({
    id: r.id,
    name: r.name,
    brand: r.brand ?? null,
    category: r.category ?? null,
    barcode: r.barcode,
    active: !!r.active,
    online: r.slug === undefined ? false : !!r.slug && r.online !== false,
    stock: Number(r.stock) || 0,
    price: Number(r.price_nok) || 0,
    isGift: !!r.is_gift_card,
  });
  const full = "id, name, brand, category, barcode, active, online, slug, stock, price_nok, is_gift_card";
  const base = "id, name, barcode, active, stock, price_nok, is_gift_card";
  try {
    const rows = await fetchAll<ProdRow>((from, to) =>
      sb.from("products").select(full).order("id").range(from, to).returns<ProdRow[]>(),
    );
    return rows.map(map);
  } catch {
    // Nettbutikk-kolonnene finnes ikke ennå.
    const rows = await fetchAll<ProdRow>((from, to) =>
      sb.from("products").select(base).order("id").range(from, to).returns<ProdRow[]>(),
    );
    return rows.map(map);
  }
}

async function loadCosts(sb: Supa): Promise<{ ok: boolean; costs: Map<string, Cost> }> {
  type Row = { product_id: string; cost_nok: number | string; supplier: string | null; supplier_sku: string | null };
  try {
    const rows = await fetchAll<Row>((from, to) =>
      sb
        .from("product_costs")
        .select("product_id, cost_nok, supplier, supplier_sku")
        .order("product_id")
        .range(from, to)
        .returns<Row[]>(),
    );
    return {
      ok: true,
      costs: new Map(rows.map((r) => [r.product_id, { cost: Number(r.cost_nok) || 0, supplier: r.supplier, sku: r.supplier_sku }])),
    };
  } catch {
    return { ok: false, costs: new Map() };
  }
}

type SoldLine = { productId: string; qty: number; revInkl: number };

/** Produktlinjer solgt i perioden, med rabatt fordelt forholdsmessig. */
async function loadSoldLines(sb: Supa, startIso: string, endIso: string): Promise<SoldLine[]> {
  type Sale = {
    id: string;
    total_nok: number | string | null;
    sale_items:
      | { kind: string | null; ref_id: string | null; quantity: number | null; price_nok: number | string | null }[]
      | null;
  };
  const sales = await fetchAll<Sale>((from, to) =>
    sb
      .from("sales")
      .select("id, total_nok, sale_items(kind, ref_id, quantity, price_nok)")
      .gte("sold_at", startIso)
      .lt("sold_at", endIso)
      .order("id")
      .range(from, to)
      .returns<Sale[]>(),
  );
  const out: SoldLine[] = [];
  for (const s of sales) {
    const items = s.sale_items ?? [];
    const gross = sum(items.map((i) => (Number(i.quantity) || 1) * (Number(i.price_nok) || 0)));
    const f = gross > 0 ? (Number(s.total_nok) || 0) / gross : 1;
    for (const i of items) {
      if (i.kind !== "product" || !i.ref_id) continue;
      const qty = Number(i.quantity) || 1;
      out.push({ productId: i.ref_id, qty, revInkl: qty * (Number(i.price_nok) || 0) * f });
    }
  }
  return out;
}

/* ---------- varer-liste ---------- */
async function buildListe({ sb }: ReportContext): Promise<ReportSheet[]> {
  const [all, c] = await Promise.all([loadProducts(sb), loadCosts(sb)]);
  const prods = all.filter((p) => !p.isGift);
  const gifts = all.filter((p) => p.isGift);

  const rows: Record<string, Cell>[] = prods.map((p) => {
    const cost = c.costs.get(p.id);
    const eks = p.price / (1 + MVA);
    const marginKr = cost ? eks - cost.cost : null;
    return {
      name: p.name,
      brand: p.brand,
      category: p.category,
      barcode: p.barcode,
      active: p.active ? "Ja" : "Nei",
      online: p.online ? "Ja" : "Nei",
      stock: p.stock,
      priceInkl: r2(p.price),
      priceEks: r2(eks),
      cost: cost ? r2(cost.cost) : null,
      supplier: cost?.supplier ?? null,
      sku: cost?.sku ?? null,
      marginKr: marginKr === null ? null : r2(marginKr),
      marginPct: marginKr !== null && eks > 0 ? marginKr / eks : null,
      stockValCost: cost ? r2(p.stock * cost.cost) : null,
      stockValSale: r2(p.stock * p.price),
    };
  });
  const costedStock = sum(prods.map((p) => (c.costs.has(p.id) ? p.stock * c.costs.get(p.id)!.cost : 0)));
  const costed = prods.filter((p) => c.costs.has(p.id) && p.price > 0);
  const avgMargin = costed.length
    ? sum(costed.map((p) => 1 - c.costs.get(p.id)!.cost / (p.price / (1 + MVA)))) / costed.length
    : null;

  const columns: Column[] = [
    { key: "name", header: "Varenavn", type: "text", width: 36 },
    { key: "brand", header: "Merke", type: "text" },
    { key: "category", header: "Kategori", type: "text" },
    { key: "barcode", header: "Strekkode", type: "text" },
    { key: "active", header: "Aktiv", type: "text", width: 8 },
    { key: "online", header: "På nett", type: "text", width: 8 },
    { key: "stock", header: "Lager", type: "int", total: "sum" },
    { key: "priceInkl", header: "Utsalgspris inkl. mva", type: "money2" },
    { key: "priceEks", header: "Utsalgspris eks. mva", type: "money2" },
    { key: "cost", header: "Innkjøpspris eks. mva", type: "money2" },
    { key: "supplier", header: "Leverandør", type: "text" },
    { key: "sku", header: "Lev. varenr.", type: "text" },
    { key: "marginKr", header: "Margin kr", type: "money2" },
    { key: "marginPct", header: "Margin %", type: "pct" },
    { key: "stockValCost", header: "Lagerverdi innkjøp", type: "money", total: "sum" },
    { key: "stockValSale", header: "Lagerverdi utsalg", type: "money", total: "sum" },
  ];

  const notes = [
    "Utsalgspris er inkl. 25 % mva; innkjøpspris er eks. mva. Margin = (pris eks. mva − innkjøp) / pris eks. mva.",
    "Lagerverdi utsalg = lager × utsalgspris inkl. mva. Lagerverdi innkjøp regnes bare for varer med innkjøpspris.",
    gifts.length ? `${gifts.length} gavekort-produkt(er) er holdt utenfor lista.` : "",
    c.ok ? "" : COST_SQL_NOTE,
  ].filter(Boolean);

  return [
    {
      name: "Varer",
      title: "Varer – alle produkter",
      subtitle: "Aktive og inaktive, med innkjøpspris, margin og lagerverdi",
      kpis: [
        { label: "Antall varer", value: prods.length, type: "int", hint: `${prods.filter((p) => p.active).length} aktive` },
        {
          label: "Lagerverdi innkjøp",
          value: c.ok ? r2(costedStock) : null,
          type: "money",
          hint: c.ok ? "eks. mva, varer med innkjøpspris" : "mangler innkjøpspris",
        },
        { label: "Lagerverdi utsalg", value: r2(sum(prods.map((p) => p.stock * p.price))), type: "money", hint: "inkl. mva" },
        { label: "Snittmargin", value: avgMargin, type: "pct", hint: `${costed.length} varer med innkjøpspris` },
      ],
      tables: [{ columns, rows, note: notes.join(" ") }],
    },
  ];
}

/* ---------- varer-salg ---------- */
async function buildSalg({ sb, range }: ReportContext): Promise<ReportSheet[]> {
  const [all, c, lines] = await Promise.all([
    loadProducts(sb),
    loadCosts(sb),
    loadSoldLines(sb, range.startIso, range.endIso),
  ]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const agg = new Map<string, { qty: number; rev: number }>();
  for (const l of lines) {
    const a = agg.get(l.productId) ?? { qty: 0, rev: 0 };
    a.qty += l.qty;
    a.rev += l.revInkl;
    agg.set(l.productId, a);
  }
  type R = {
    name: string;
    qty: number;
    inkl: number;
    eks: number;
    cost: number | null;
    profit: number | null;
    pct: number | null;
  };
  const list: R[] = [...agg.entries()].map(([id, a]) => {
    const cost = c.costs.get(id);
    const eks = a.rev / (1 + MVA);
    const costSum = cost ? a.qty * cost.cost : null;
    const profit = costSum === null ? null : eks - costSum;
    return {
      name: byId.get(id)?.name ?? "(slettet vare)",
      qty: a.qty,
      inkl: r2(a.rev),
      eks: r2(eks),
      cost: costSum === null ? null : r2(costSum),
      profit: profit === null ? null : r2(profit),
      pct: profit !== null && eks > 0 ? profit / eks : null,
    };
  });
  list.sort((a, b) => b.inkl - a.inkl);

  const columns: Column[] = [
    { key: "name", header: "Vare", type: "text", width: 36 },
    { key: "qty", header: "Antall solgt", type: "int", total: "sum" },
    { key: "inkl", header: "Omsetning inkl. mva", type: "money", total: "sum" },
    { key: "eks", header: "Omsetning eks. mva", type: "money", total: "sum" },
    { key: "cost", header: "Innkjøpskost", type: "money", total: "sum" },
    { key: "profit", header: "Bruttofortjeneste", type: "money", total: "sum" },
    { key: "pct", header: "Margin %", type: "pct" },
  ];
  const toRow = (r: R): Record<string, Cell> => ({ ...r });

  const withProfit = list.filter((r) => r.profit !== null);
  const totEksCosted = sum(withProfit.map((r) => r.eks));
  const totProfit = sum(withProfit.map((r) => r.profit!));
  const byQty = [...list].sort((a, b) => b.qty - a.qty || b.inkl - a.inkl);

  return [
    {
      name: "Varesalg",
      title: "Varesalg per produkt",
      subtitle: range.label,
      kpis: [
        { label: "Enheter solgt", value: sum(list.map((r) => r.qty)), type: "int" },
        { label: "Omsetning eks. mva", value: r2(sum(list.map((r) => r.eks))), type: "money" },
        {
          label: "Bruttofortjeneste",
          value: c.ok ? r2(totProfit) : null,
          type: "money",
          hint: c.ok ? "varer med innkjøpspris" : "mangler innkjøpspris",
        },
        { label: "Margin", value: totEksCosted > 0 ? totProfit / totEksCosted : null, type: "pct" },
      ],
      tables: [
        {
          title: "Alle solgte varer (størst omsetning først)",
          columns,
          rows: list.map(toRow),
          note: [
            "Inkluderer salg i kassa og nettbutikk. Rabatt er fordelt forholdsmessig på linjene. Annullerte salg er slettet fra salgstabellen og er ikke med.",
            "Innkjøpskost = antall × dagens innkjøpspris (ikke historisk). Varer uten innkjøpspris har tom kost og fortjeneste.",
            c.ok ? "" : COST_SQL_NOTE,
          ]
            .filter(Boolean)
            .join(" "),
        },
        { title: "Mest solgt (antall)", columns, rows: byQty.slice(0, 10).map(toRow) },
        { title: "Minst solgt (av varene som solgte)", columns, rows: [...byQty].reverse().slice(0, 10).map(toRow) },
      ],
    },
  ];
}

/* ---------- varer-lagerbevegelser ---------- */
async function buildBevegelser({ sb, range }: ReportContext): Promise<ReportSheet[]> {
  type M = { id: string; product_id: string; delta: number; reason: string | null; note: string | null; created_at: string };
  const [all, moves] = await Promise.all([
    loadProducts(sb),
    fetchAll<M>((from, to) =>
      sb
        .from("stock_movements")
        .select("id, product_id, delta, reason, note, created_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at")
        .order("id")
        .range(from, to)
        .returns<M[]>(),
    ),
  ]);
  const names = new Map(all.map((p) => [p.id, p.name]));
  const rows: Record<string, Cell>[] = moves.map((m) => ({
    date: osloDay(m.created_at),
    product: names.get(m.product_id) ?? "(slettet vare)",
    delta: Number(m.delta) || 0,
    reason: m.reason ?? "ukjent",
    note: m.note,
  }));
  const per = new Map<string, { n: number; plus: number; minus: number }>();
  for (const m of moves) {
    const k = m.reason ?? "ukjent";
    const a = per.get(k) ?? { n: 0, plus: 0, minus: 0 };
    const d = Number(m.delta) || 0;
    a.n += 1;
    if (d >= 0) a.plus += d;
    else a.minus += d;
    per.set(k, a);
  }
  const summary = [...per.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([reason, a]) => ({ reason, n: a.n, plus: a.plus, minus: a.minus, net: a.plus + a.minus }));

  return [
    {
      name: "Lagerbevegelser",
      title: "Lagerbevegelser",
      subtitle: range.label,
      kpis: [
        { label: "Bevegelser", value: moves.length, type: "int" },
        { label: "Inn (enheter)", value: sum(summary.map((s) => s.plus)), type: "int" },
        { label: "Ut (enheter)", value: sum(summary.map((s) => s.minus)), type: "int" },
      ],
      tables: [
        {
          title: "Oppsummering per årsak",
          columns: [
            { key: "reason", header: "Årsak", type: "text", width: 24 },
            { key: "n", header: "Antall", type: "int", total: "sum" },
            { key: "plus", header: "Inn", type: "int", total: "sum" },
            { key: "minus", header: "Ut", type: "int", total: "sum" },
            { key: "net", header: "Netto", type: "int", total: "sum" },
          ],
          rows: summary,
        },
        {
          title: "Alle bevegelser",
          columns: [
            { key: "date", header: "Dato", type: "date" },
            { key: "product", header: "Vare", type: "text", width: 36 },
            { key: "delta", header: "Endring", type: "int", total: "sum" },
            { key: "reason", header: "Årsak", type: "text", width: 20 },
            { key: "note", header: "Notat", type: "text", width: 40 },
          ],
          rows,
        },
      ],
    },
  ];
}

/* ---------- varer-hyllevarmere ---------- */
async function buildHylle({ sb, range }: ReportContext): Promise<ReportSheet[]> {
  type Ever = { id: string; ref_id: string | null; sales: { sold_at: string } | { sold_at: string }[] | null };
  const [all, c, inPeriod, ever] = await Promise.all([
    loadProducts(sb),
    loadCosts(sb),
    loadSoldLines(sb, range.startIso, range.endIso),
    // Siste salg noen gang per vare (produktlinjer med salgstidspunkt).
    fetchAll<Ever>((from, to) =>
      sb
        .from("sale_items")
        .select("id, ref_id, sales!inner(sold_at)")
        .eq("kind", "product")
        .lt("sales.sold_at", range.endIso)
        .order("id")
        .range(from, to)
        .returns<Ever[]>(),
    ).catch((): Ever[] | null => null),
  ]);
  const lastSaleFailed = ever === null;
  const soldNow = new Set(inPeriod.map((l) => l.productId));
  const last = new Map<string, string>();
  for (const it of ever ?? []) {
    if (!it.ref_id) continue;
    const s = Array.isArray(it.sales) ? it.sales[0] : it.sales;
    if (!s) continue;
    const prev = last.get(it.ref_id);
    if (!prev || s.sold_at > prev) last.set(it.ref_id, s.sold_at);
  }
  const refMs = Math.min(Date.now(), new Date(range.endIso).getTime());
  const shelf = all.filter((p) => !p.isGift && p.active && p.stock > 0 && !soldNow.has(p.id));
  const items = shelf
    .map((p) => {
      const l = last.get(p.id);
      const cost = c.costs.get(p.id);
      return {
        name: p.name,
        brand: p.brand,
        stock: p.stock,
        stockValSale: r2(p.stock * p.price),
        stockValCost: cost ? r2(p.stock * cost.cost) : null,
        lastSale: l && !lastSaleFailed ? osloDay(l) : null,
        days: l && !lastSaleFailed ? Math.max(0, Math.floor((refMs - new Date(l).getTime()) / 86_400_000)) : null,
      };
    })
    .sort((a, b) => b.stockValSale - a.stockValSale);
  const rows: Record<string, Cell>[] = items.map((r) => ({ ...r }));

  return [
    {
      name: "Hyllevarmere",
      title: "Hyllevarmere – på lager, ingen salg i perioden",
      subtitle: range.label,
      kpis: [
        { label: "Antall varer", value: items.length, type: "int" },
        { label: "Bundet i utsalgsverdi", value: r2(sum(items.map((r) => r.stockValSale))), type: "money", hint: "inkl. mva" },
        {
          label: "Bundet i innkjøp",
          value: c.ok ? r2(sum(items.map((r) => r.stockValCost ?? 0))) : null,
          type: "money",
          hint: c.ok ? "eks. mva" : "mangler innkjøpspris",
        },
      ],
      tables: [
        {
          columns: [
            { key: "name", header: "Vare", type: "text", width: 36 },
            { key: "brand", header: "Merke", type: "text" },
            { key: "stock", header: "Lager", type: "int", total: "sum" },
            { key: "stockValSale", header: "Lagerverdi utsalg", type: "money", total: "sum" },
            { key: "stockValCost", header: "Lagerverdi innkjøp", type: "money", total: "sum" },
            { key: "lastSale", header: "Siste salg", type: "date" },
            { key: "days", header: "Dager siden siste salg", type: "int" },
          ],
          rows,
          note: [
            lastSaleFailed
              ? "Siste salg kunne ikke hentes – «siste salg» og «dager siden» er tomme."
              : "Aktive varer med lager > 0 og ingen salg i valgt periode. Tom «siste salg» = aldri solgt via kassa/nettbutikk.",
            c.ok ? "" : COST_SQL_NOTE,
          ]
            .filter(Boolean)
            .join(" "),
        },
      ],
    },
  ];
}

export const REPORTS: ReportDef[] = [
  {
    key: "varer-liste",
    title: "Varer – alle med innkjøpspris",
    description: "Alle produkter med innkjøpspris, leverandør, margin og lagerverdi (nå-status).",
    category: "Varer",
    usesRange: false,
    build: buildListe,
  },
  {
    key: "varer-salg",
    title: "Varesalg og fortjeneste",
    description: "Solgte varer i perioden med omsetning, innkjøpskost, bruttofortjeneste og margin.",
    category: "Varer",
    build: buildSalg,
  },
  {
    key: "varer-lagerbevegelser",
    title: "Lagerbevegelser",
    description: "Alle lagerendringer i perioden, med oppsummering per årsak.",
    category: "Varer",
    build: buildBevegelser,
  },
  {
    key: "varer-hyllevarmere",
    title: "Hyllevarmere",
    description: "Varer på lager uten salg i perioden, med dager siden siste salg.",
    category: "Varer",
    build: buildHylle,
  },
];
