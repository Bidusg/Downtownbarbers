import { fetchAll, fetchAllSafe } from "@/lib/reports/fetch-all";
import { BARBER_NETT, BUCKETS, BUCKET_LABEL, eachDay, loadSales, r2, WEEKDAYS, weekdayOf } from "@/lib/reports/omsetning";
import type { Bucket } from "@/lib/reports/omsetning";
import type { Range } from "@/lib/report-queries";
import type { Cell, ReportDef, ReportSheet, Supa } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTSENTER – KASSE
 *   Betalingsmåter, kasseoppgjør (forventet vs talt) og rabatter.
 *   Betalinger kommer fra loadSales (omsetning.ts), gruppert på Oslo-dag.
 *   Beløp i kassa er inkl. mva – kasserapportene viser brutto (det som
 *   faktisk går gjennom kassa), ikke eks. mva.
 *   Kasseoppgjør: forventet beløp bruker lagret snapshot (expected_*) når
 *   det finnes, ellers regnes det fra salg den Oslo-dagen. Kolonner som
 *   mangler i databasen (confirmed, counted_*, expected_*) tåles.
 * ===================================================================== */

type Ctx = { range: Range; sb: Supa };
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const NOTE_BRUTTO = "Beløp er inkl. mva (som betalt i kassa). Annullerte salg og gavekortsalg er ikke med.";

/* ---------------------------- Betalingsmåter ---------------------------- */

async function betalingsmate({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const tot: Record<Bucket, { n: number; sum: number }> = {
    kort: { n: 0, sum: 0 },
    kontant: { n: 0, sum: 0 },
    vipps: { n: 0, sum: 0 },
    gavekort: { n: 0, sum: 0 },
    annet: { n: 0, sum: 0 },
  };
  const perDay = new Map<string, Record<Bucket, number>>();
  const raw = new Map<string, { n: number; sum: number }>();
  for (const s of sales) {
    const d = perDay.get(s.day) ?? { kort: 0, kontant: 0, vipps: 0, gavekort: 0, annet: 0 };
    for (const p of s.pays) {
      tot[p.m].n += 1;
      tot[p.m].sum += p.amount;
      d[p.m] += p.amount;
      const k = p.raw || "(tom)";
      const x = raw.get(k) ?? { n: 0, sum: 0 };
      x.n += 1;
      x.sum += p.amount;
      raw.set(k, x);
    }
    perDay.set(s.day, d);
  }
  const grand = BUCKETS.reduce((t, b) => t + tot[b].sum, 0);

  const sumRows = BUCKETS.map((b) => ({
    metode: BUCKET_LABEL[b],
    antall: tot[b].n,
    belop: r2(tot[b].sum),
    andel: grand > 0 ? tot[b].sum / grand : null,
  }));

  const dayCols = [
    { key: "dato", header: "Dato", type: "date" as const },
    { key: "ukedag", header: "Ukedag", type: "text" as const },
    ...BUCKETS.map((b) => ({ key: b, header: BUCKET_LABEL[b], type: "money" as const, total: "sum" as const })),
    { key: "sum", header: "Sum", type: "money" as const, total: "sum" as const },
  ];
  const dayRows = eachDay(range.from, range.to).map((d) => {
    const v = perDay.get(d);
    const row: Record<string, Cell> = { dato: d, ukedag: WEEKDAYS[weekdayOf(d)] };
    let t = 0;
    for (const b of BUCKETS) {
      row[b] = r2(v?.[b] ?? 0);
      t += v?.[b] ?? 0;
    }
    row.sum = r2(t);
    return row;
  });

  const rawRows = [...raw.entries()]
    .map(([metode, x]) => ({ metode, antall: x.n, belop: r2(x.sum) }))
    .sort((a, b) => b.belop - a.belop);

  return [
    {
      name: "Betalingsmåter",
      title: "Betalingsmåter",
      subtitle: range.label,
      kpis: BUCKETS.filter((b) => b !== "annet" || tot.annet.sum > 0).map((b) => ({
        label: BUCKET_LABEL[b],
        value: r2(tot[b].sum),
        type: "money" as const,
      })),
      tables: [
        {
          title: "Sammendrag",
          columns: [
            { key: "metode", header: "Betalingsmåte", type: "text" },
            { key: "antall", header: "Antall betalinger", type: "int", total: "sum" },
            { key: "belop", header: "Beløp", type: "money", total: "sum" },
            { key: "andel", header: "Andel", type: "pct" },
          ],
          rows: sumRows,
          note: [NOTE_BRUTTO, "Delbetalinger telles per betalingsdel. Gavekort = innløsning av gavekort.", ...notes].join(" "),
        },
        {
          title: "Per dag (Oslo-dag)",
          columns: dayCols,
          rows: dayRows,
          note: "Dager uten salg er tatt med (0).",
        },
        {
          title: "Registrert betalingstekst (rådata)",
          columns: [
            { key: "metode", header: "Tekst i databasen", type: "text" },
            { key: "antall", header: "Antall", type: "int", total: "sum" },
            { key: "belop", header: "Beløp", type: "money", total: "sum" },
          ],
          rows: rawRows,
          note: "Hjelper å oppdage betalingsmåter som havner under «Annet / ukjent».",
        },
      ],
    },
  ];
}

/* ---------------------------- Kasseoppgjør ---------------------------- */

type SettleRow = {
  id: string;
  settle_date: string;
  total_nok: number | null;
  note: string | null;
  confirmed?: boolean | null;
  counted_cash?: number | null;
  counted_card?: number | null;
  counted_vipps?: number | null;
  expected_cash?: number | null;
  expected_card?: number | null;
  expected_vipps?: number | null;
};

const SETTLE_BASE = "id, settle_date, total_nok, note";
const SETTLE_SELECTS: { sel: string; note?: string }[] = [
  {
    sel: `${SETTLE_BASE}, confirmed, counted_cash, counted_card, counted_vipps, expected_cash, expected_card, expected_vipps`,
  },
  {
    sel: `${SETTLE_BASE}, counted_cash, counted_card, counted_vipps, expected_cash, expected_card, expected_vipps`,
    note: "Kolonnen cash_settlements.confirmed mangler – bekreftelsesstatus vises ikke.",
  },
  {
    sel: SETTLE_BASE,
    note: "Avstemmingskolonnene (KJØR-I-SUPABASE kasseoppgjør, migrasjon 0046) mangler – oppgjør vises uten talt/forventet per betalingsmåte.",
  },
];

async function loadSettlements(sb: Supa, r: Range): Promise<{ rows: SettleRow[]; notes: string[] }> {
  for (const t of SETTLE_SELECTS) {
    try {
      const rows = await fetchAll<SettleRow>(
        (from, to) =>
          sb
            .from("cash_settlements")
            .select(t.sel)
            .gte("settle_date", r.from)
            .lte("settle_date", r.to)
            .order("settle_date")
            .order("id")
            .range(from, to) as unknown as Page<SettleRow>,
      );
      return { rows, notes: t.note ? [t.note] : [] };
    } catch {
      /* prøv enklere utvalg */
    }
  }
  return { rows: [], notes: ["Kunne ikke lese kasseoppgjør (tabellen cash_settlements)."] };
}

const num = (v: number | null | undefined): number | null => (v == null ? null : Number(v));

async function oppgjor({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const [{ sales, notes: salesNotes }, { rows: settles, notes }] = await Promise.all([
    loadSales(sb, range),
    loadSettlements(sb, range),
  ]);

  // Forventet per Oslo-dag fra salg (kort/kontant/vipps; gavekort og annet holdes utenfor kassebeløpet).
  const exp = new Map<string, { cash: number; card: number; vipps: number }>();
  for (const s of sales) {
    const e = exp.get(s.day) ?? { cash: 0, card: 0, vipps: 0 };
    for (const p of s.pays) {
      if (p.m === "kontant") e.cash += p.amount;
      else if (p.m === "kort") e.card += p.amount;
      else if (p.m === "vipps") e.vipps += p.amount;
    }
    exp.set(s.day, e);
  }

  const byDate = new Map<string, SettleRow[]>();
  for (const s of settles) {
    const a = byDate.get(s.settle_date) ?? [];
    a.push(s);
    byDate.set(s.settle_date, a);
  }

  let missing = 0;
  let unconfirmed = 0;
  let netDiff = 0;
  let absDiff = 0;
  const rows = eachDay(range.from, range.to)
    .filter((d) => byDate.has(d) || exp.has(d))
    .map((d) => {
      const list = byDate.get(d) ?? [];
      const st = list.length ? list[list.length - 1] : undefined;
      const fallback = exp.get(d) ?? { cash: 0, card: 0, vipps: 0 };
      const expCash = num(st?.expected_cash) ?? fallback.cash;
      const expCard = num(st?.expected_card) ?? fallback.card;
      const expVipps = num(st?.expected_vipps) ?? fallback.vipps;
      const expTotal = expCash + expCard + expVipps;
      const cCash = num(st?.counted_cash);
      const cCard = num(st?.counted_card);
      const cVipps = num(st?.counted_vipps);
      const hasCounted = cCash != null || cCard != null || cVipps != null;
      const counted = hasCounted ? (cCash ?? 0) + (cCard ?? 0) + (cVipps ?? 0) : num(st?.total_nok);
      const diff = st && counted != null ? counted - expTotal : null;
      const cashDiff = cCash != null ? cCash - expCash : null;

      let status: string;
      if (!st) {
        status = "Mangler oppgjør";
        if (expTotal > 0) missing += 1;
      } else if (st.confirmed === false) {
        status = "Utkast (ikke bekreftet)";
        unconfirmed += 1;
      } else if (!hasCounted) {
        status = "Uten avstemming";
      } else if (diff != null && Math.abs(diff) < 0.5) {
        status = "Stemmer";
      } else {
        status = diff != null && diff < 0 ? "Manko" : "Overskudd";
      }
      if (diff != null && hasCounted) {
        netDiff += diff;
        absDiff += Math.abs(diff);
      }
      return {
        dato: d,
        ukedag: WEEKDAYS[weekdayOf(d)],
        status,
        forventetKontant: r2(expCash),
        taltKontant: cCash,
        diffKontant: cashDiff == null ? null : r2(cashDiff),
        forventetKort: r2(expCard),
        forventetVipps: r2(expVipps),
        forventetTotal: r2(expTotal),
        taltTotal: counted == null ? null : r2(counted),
        avvik: diff == null || !hasCounted ? null : r2(diff),
        notat: st?.note ?? null,
      };
    });

  return [
    {
      name: "Kasseoppgjør",
      title: "Kasseoppgjør – forventet mot talt",
      subtitle: range.label,
      kpis: [
        { label: "Dager med salg uten oppgjør", value: missing, type: "int" },
        { label: "Ubekreftede utkast", value: unconfirmed, type: "int" },
        { label: "Netto avvik", value: r2(netDiff), type: "money", hint: "talt − forventet" },
        { label: "Sum absolutt avvik", value: r2(absDiff), type: "money" },
      ],
      tables: [
        {
          columns: [
            { key: "dato", header: "Dato", type: "date" },
            { key: "ukedag", header: "Ukedag", type: "text" },
            { key: "status", header: "Status", type: "text" },
            { key: "forventetKontant", header: "Forventet kontant", type: "money", total: "sum" },
            { key: "taltKontant", header: "Talt kontant", type: "money", total: "sum" },
            { key: "diffKontant", header: "Avvik kontant", type: "money", total: "sum" },
            { key: "forventetKort", header: "Forventet kort", type: "money", total: "sum" },
            { key: "forventetVipps", header: "Forventet Vipps", type: "money", total: "sum" },
            { key: "forventetTotal", header: "Forventet totalt", type: "money", total: "sum" },
            { key: "taltTotal", header: "Talt totalt", type: "money", total: "sum" },
            { key: "avvik", header: "Avvik totalt", type: "money", total: "sum" },
            { key: "notat", header: "Notat", type: "text" },
          ],
          rows,
          note: [
            "Forventet = lagret snapshot fra oppgjøret når det finnes, ellers regnet fra salg den Oslo-dagen (kontant + kort + Vipps; gavekort holdes utenfor).",
            "Avvik = talt − forventet (negativt = manko). Ved flere oppgjør samme dag vises det nyeste.",
            NOTE_BRUTTO,
            ...notes,
            ...salesNotes,
          ].join(" "),
        },
      ],
    },
  ];
}

/* ---------------------------- Rabatter ---------------------------- */

async function rabatter({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const withDisc = sales.filter((s) => s.discount > 0);

  const per = new Map<string, { n: number; rabatt: number; brutto: number }>();
  for (const s of withDisc) {
    const x = per.get(s.staffName) ?? { n: 0, rabatt: 0, brutto: 0 };
    x.n += 1;
    x.rabatt += s.discount;
    x.brutto += s.total + s.discount;
    per.set(s.staffName, x);
  }
  const perRows = [...per.entries()]
    .map(([navn, x]) => ({ navn, antall: x.n, rabatt: r2(x.rabatt), pct: x.brutto > 0 ? x.rabatt / x.brutto : null }))
    .sort((a, b) => b.rabatt - a.rabatt);

  const totDisc = withDisc.reduce((t, s) => t + s.discount, 0);
  const totGross = withDisc.reduce((t, s) => t + s.total + s.discount, 0);

  const salgRows = [...withDisc]
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 200)
    .map((s) => ({
      tid: s.soldAt,
      barber: s.staffName,
      for: r2(s.total + s.discount),
      rabatt: r2(s.discount),
      betalt: r2(s.total),
    }));

  return [
    {
      name: "Rabatter",
      title: "Rabatter gitt i kassa",
      subtitle: range.label,
      kpis: [
        { label: "Rabatt totalt", value: r2(totDisc), type: "money", hint: "inkl. mva" },
        { label: "Salg med rabatt", value: withDisc.length, type: "int" },
        { label: "Rabatt av bruttosalg", value: totGross > 0 ? totDisc / totGross : null, type: "pct", hint: "kun salg med rabatt" },
      ],
      tables: [
        {
          title: "Per barber",
          columns: [
            { key: "navn", header: "Barber", type: "text" },
            { key: "antall", header: "Salg med rabatt", type: "int", total: "sum" },
            { key: "rabatt", header: "Rabatt", type: "money", total: "sum" },
            { key: "pct", header: "Rabatt av brutto", type: "pct" },
          ],
          rows: perRows,
          note: [NOTE_BRUTTO, "Rabatt = sales.discount_nok.", ...notes].join(" "),
        },
        {
          title: "Største rabatter (maks 200)",
          columns: [
            { key: "tid", header: "Tidspunkt", type: "datetime" },
            { key: "barber", header: "Barber", type: "text" },
            { key: "for", header: "Før rabatt", type: "money" },
            { key: "rabatt", header: "Rabatt", type: "money", total: "sum" },
            { key: "betalt", header: "Betalt", type: "money" },
          ],
          rows: salgRows,
        },
      ],
    },
  ];
}

/* ---------------------------- Gavekort ---------------------------- */

type GiftRow = {
  id: string;
  code: string;
  initial_nok: number | null;
  balance_nok: number | null;
  created_at: string;
  expires_at: string | null;
};

async function gavekort({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const sold = await fetchAllSafe<GiftRow>(
    (from, to) =>
      sb
        .from("gift_cards")
        .select("id, code, initial_nok, balance_nok, created_at, expires_at")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .order("created_at")
        .order("id")
        .range(from, to) as unknown as Page<GiftRow>,
  );
  const open = await fetchAllSafe<GiftRow>(
    (from, to) =>
      sb
        .from("gift_cards")
        .select("id, code, initial_nok, balance_nok, created_at, expires_at")
        .gt("balance_nok", 0)
        .order("created_at")
        .order("id")
        .range(from, to) as unknown as Page<GiftRow>,
  );
  const { sales } = await loadSales(sb, range);
  const redeemed = sales.reduce((t, s) => t + s.pays.filter((p) => p.m === "gavekort").reduce((a, p) => a + p.amount, 0), 0);

  const soldSum = sold.reduce((t, g) => t + (Number(g.initial_nok) || 0), 0);
  const openSum = open.reduce((t, g) => t + (Number(g.balance_nok) || 0), 0);

  const mask = (c: string) => `••••••${c.slice(-2)}`;
  const mkRow = (g: GiftRow) => ({
    kode: mask(g.code),
    opprettet: g.created_at,
    utlop: g.expires_at,
    opprinnelig: num(g.initial_nok),
    saldo: num(g.balance_nok),
  });
  const cols = [
    { key: "kode", header: "Kode (maskert)", type: "text" as const },
    { key: "opprettet", header: "Opprettet", type: "datetime" as const },
    { key: "utlop", header: "Utløper", type: "date" as const },
    { key: "opprinnelig", header: "Opprinnelig verdi", type: "money" as const, total: "sum" as const },
    { key: "saldo", header: "Saldo", type: "money" as const, total: "sum" as const },
  ];

  return [
    {
      name: "Gavekort",
      title: "Gavekort – salg, innløsning og utestående",
      subtitle: range.label,
      kpis: [
        { label: "Solgt i perioden", value: r2(soldSum), type: "money", hint: "forskudd (konto 2900), ikke omsetning" },
        { label: "Innløst i perioden", value: r2(redeemed), type: "money", hint: "betalt med gavekort i kassa" },
        { label: "Utestående saldo nå", value: r2(openSum), type: "money", hint: "alle kort med saldo, uavhengig av periode" },
      ],
      tables: [
        {
          title: "Solgt i perioden",
          columns: cols,
          rows: sold.map(mkRow),
          note: "Gavekortsalg er forskudd og er aldri med i omsetningen. Innløsning telles som vanlig salg. Obs: tilgodelapper fra nettordre-returer (kode «DB-…») kan ikke skilles fra vanlige gavekort og er med.",
        },
        {
          title: "Utestående gavekort (saldo over 0)",
          columns: cols,
          rows: open.map(mkRow),
          note: "Saldo er stand akkurat nå, ikke ved periodeslutt. Inkluderer tilgodelapper fra nettordre-returer.",
        },
      ],
    },
  ];
}

/* ---------------------------- Salgsliste ---------------------------- */

async function salgsliste({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const rows = sales.map((s) => ({
    tid: s.soldAt,
    barber: s.staffName,
    kunde: s.customer || null,
    linjer: s.lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.name}` : l.name)).join("; "),
    rabatt: r2(s.discount),
    total: r2(s.total),
    betaling: s.pays.map((p) => (s.pays.length > 1 ? `${p.raw || BUCKET_LABEL[p.m]} ${Math.round(p.amount)}` : p.raw || BUCKET_LABEL[p.m])).join(" + "),
    kanal: s.online ? "Nettbutikk" : "Kasse",
  }));
  return [
    {
      name: "Salgsliste",
      title: "Salgsliste",
      subtitle: range.label,
      tables: [
        {
          columns: [
            { key: "tid", header: "Tidspunkt", type: "datetime" },
            { key: "barber", header: "Barber", type: "text" },
            { key: "kunde", header: "Kunde", type: "text" },
            { key: "linjer", header: "Linjer", type: "text", width: 50 },
            { key: "rabatt", header: "Rabatt", type: "money", total: "sum" },
            { key: "total", header: "Total", type: "money", total: "sum" },
            { key: "betaling", header: "Betalingsmåte", type: "text" },
            { key: "kanal", header: "Kanal", type: "text" },
          ],
          rows,
          note: [NOTE_BRUTTO, "Kanal «Nettbutikk» = salg uten barber og uten booking. Inneholder kundenavn – håndteres som personopplysninger.", ...notes].join(" "),
        },
      ],
    },
  ];
}

/* ---------------------------- Annulleringer ---------------------------- */

type VoidRow = {
  id: string;
  sale_id: string;
  sold_at: string;
  staff_id: string | null;
  total_nok: number | null;
  payment: { method?: string; amount?: number }[] | null;
  items: { description?: string | null; quantity?: number | null; kind?: string | null }[] | null;
  reason: string | null;
  voided_by: string | null;
  voided_at: string;
};

async function annulleringer({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const notes: string[] = [];
  let voids: VoidRow[] = [];
  try {
    voids = await fetchAll<VoidRow>(
      (from, to) =>
        sb
          .from("sale_voids")
          .select("id, sale_id, sold_at, staff_id, total_nok, payment, items, reason, voided_by, voided_at")
          .gte("voided_at", range.startIso)
          .lt("voided_at", range.endIso)
          .order("voided_at")
          .order("id")
          .range(from, to) as unknown as Page<VoidRow>,
    );
  } catch {
    notes.push("Kunne ikke lese sale_voids (tabellen mangler eller du mangler tilgang).");
  }

  const staffIds = [...new Set(voids.map((v) => v.staff_id).filter((x): x is string => !!x))];
  const byIds = [...new Set(voids.map((v) => v.voided_by).filter((x): x is string => !!x))];
  const staffName = new Map<string, string>();
  const profName = new Map<string, string>();
  if (staffIds.length) {
    const r = await fetchAllSafe<{ id: string; full_name: string | null }>(
      (from, to) =>
        sb.from("staff").select("id, full_name").in("id", staffIds).order("id").range(from, to) as unknown as Page<{
          id: string;
          full_name: string | null;
        }>,
    );
    for (const x of r) staffName.set(x.id, x.full_name ?? "");
  }
  if (byIds.length) {
    const r = await fetchAllSafe<{ id: string; full_name: string | null }>(
      (from, to) =>
        sb.from("profiles").select("id, full_name").in("id", byIds).order("id").range(from, to) as unknown as Page<{
          id: string;
          full_name: string | null;
        }>,
    );
    for (const x of r) profName.set(x.id, x.full_name ?? "");
  }

  const rows = voids.map((v) => ({
    annullert: v.voided_at,
    solgt: v.sold_at,
    barber: v.staff_id ? staffName.get(v.staff_id) || "Ukjent" : BARBER_NETT,
    belop: r2(Number(v.total_nok) || 0),
    betaling: (v.payment ?? []).map((p) => `${p.method ?? "?"} ${Math.round(Number(p.amount) || 0)}`).join(" + "),
    linjer: (v.items ?? [])
      .map((i) => {
        const q = Number(i.quantity) || 1;
        const n = i.description || i.kind || "Linje";
        return q > 1 ? `${q} × ${n}` : n;
      })
      .join("; "),
    arsak: v.reason,
    av: v.voided_by ? profName.get(v.voided_by) || null : null,
  }));
  const sum = rows.reduce((t, r) => t + r.belop, 0);

  return [
    {
      name: "Annulleringer",
      title: "Annullerte salg",
      subtitle: range.label,
      kpis: [
        { label: "Annullerte salg", value: rows.length, type: "int" },
        { label: "Annullert beløp", value: r2(sum), type: "money", hint: "inkl. mva" },
      ],
      tables: [
        {
          columns: [
            { key: "annullert", header: "Annullert", type: "datetime" },
            { key: "solgt", header: "Opprinnelig salgstid", type: "datetime" },
            { key: "barber", header: "Barber", type: "text" },
            { key: "belop", header: "Beløp", type: "money", total: "sum" },
            { key: "betaling", header: "Betaling", type: "text" },
            { key: "linjer", header: "Varer/tjenester", type: "text", width: 50 },
            { key: "arsak", header: "Årsak", type: "text" },
            { key: "av", header: "Annullert av", type: "text" },
          ],
          rows,
          note: [
            "Perioden gjelder tidspunktet for annulleringen, ikke opprinnelig salgstid. Annullerte salg er slettet fra salgstabellen og er ikke med i andre rapporter.",
            "«Annullert av» er blankt når brukeren ikke finnes i profiles.",
            ...notes,
          ].join(" "),
        },
      ],
    },
  ];
}

export const REPORTS: ReportDef[] = [
  {
    key: "kasse-betalingsmate",
    title: "Betalingsmåter",
    description: "Kort, kontant, Vipps og gavekort: sammendrag og per dag (Oslo-dag).",
    category: "Kasse",
    build: betalingsmate,
  },
  {
    key: "kasse-oppgjor",
    title: "Kasseoppgjør – forventet mot talt",
    description: "Per dag: forventet beløp fra salg mot talt beløp, avvik og dager uten oppgjør.",
    category: "Kasse",
    build: oppgjor,
  },
  {
    key: "kasse-rabatter",
    title: "Rabatter",
    description: "Rabatt gitt per barber og de største enkeltrabattene.",
    category: "Kasse",
    build: rabatter,
  },
  {
    key: "kasse-gavekort",
    title: "Gavekort",
    description: "Solgt, innløst og utestående saldo.",
    category: "Kasse",
    build: gavekort,
  },
  {
    key: "kasse-salgsliste",
    title: "Salgsliste",
    description: "Hvert salg med tidspunkt, barber, kunde, linjer, rabatt, total, betalingsmåte og kanal.",
    category: "Kasse",
    build: salgsliste,
  },
  {
    key: "kasse-annulleringer",
    title: "Annulleringer",
    description: "Annullerte salg i perioden med årsak, beløp og hvem som annullerte.",
    category: "Kasse",
    build: annulleringer,
  },
];
