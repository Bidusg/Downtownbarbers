import { ABSENCE_KINDS, type AbsenceKind } from "@/lib/absence-kinds";
import { baseSalaryForMonth, getAbsenceDays } from "@/lib/absence-pay";
import { getHistoricalForMonth } from "@/lib/historical-revenue";
import { getStaffOptions, PAYROLL, payrollIncludes } from "@/lib/ops-queries";
import { fetchAll } from "@/lib/reports/fetch-all";
import { weekdayOf, WEEKDAYS } from "@/lib/reports/omsetning";
import type { Cell, ReportDef, ReportSheet, Supa, Table } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTER – LØNN (sensitivt: kun admin/eier/revisor)
 *   lonn-maned     Samme regnestykke som lønnsslippene (enkel modell):
 *                  grunnlønn + 40 % av omsetning eks. mva over terskel.
 *                  Bruker byggeklossene fra ops-queries/absence-pay, men
 *                  henter salg med .range()-paging (getPayroll kuttes ved
 *                  1000 rader). Månedsgrenser er UTC, som i lønnsslippene.
 *   lonn-fravaer   Fravær som overlapper perioden. Årsak (reason) tas ikke med.
 *   lonn-arbeidstid Stemplet arbeidstid (RPC staff_shift_days).
 * ===================================================================== */

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const MAX_MONTHS = 12;
const r0 = (n: number) => Math.round(n);

/** (år, måned) fra periodens første til siste dato, maks MAX_MONTHS. */
function monthsIn(from: string, to: string): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  const ey = +to.slice(0, 4);
  const em = +to.slice(5, 7);
  while ((y < ey || (y === ey && m <= em)) && out.length < MAX_MONTHS) {
    out.push({ y, m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const MONTHS_NB = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

/* ------------------------------ Lønn per måned ------------------------------ */

async function payrollTable(sb: Supa, y: number, m: number): Promise<{ table: Table; totals: { gross: number; total: number; commission: number } }> {
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();

  const staff = await getStaffOptions({ includeInactive: true });
  const sales = await fetchAll<{ staff_id: string | null; total_nok: number | string | null }>(
    (f, t) =>
      sb
        .from("sales")
        .select("staff_id, total_nok")
        .gte("sold_at", start)
        .lt("sold_at", end)
        .order("sold_at")
        .order("id")
        .range(f, t) as unknown as Page<{ staff_id: string | null; total_nok: number | string | null }>,
  );

  const gross = new Map<string, number>();
  for (const s of sales) {
    if (!s.staff_id) continue;
    gross.set(s.staff_id, (gross.get(s.staff_id) ?? 0) + (Number(s.total_nok) || 0));
  }
  const imported = new Map<string, number>();
  for (const h of await getHistoricalForMonth(y, m)) {
    gross.set(h.staffId, (gross.get(h.staffId) ?? 0) + h.totalNok);
    imported.set(h.staffId, (imported.get(h.staffId) ?? 0) + h.totalNok);
  }
  const absence = await getAbsenceDays(y, m);

  let tGross = 0;
  let tTotal = 0;
  let tComm = 0;
  const rows: Record<string, Cell>[] = [];
  for (const st of staff) {
    if (!payrollIncludes(st, y, m, gross)) continue;
    const g = gross.get(st.id) ?? 0;
    const net = g / (1 + PAYROLL.MVA);
    const commissionBase = Math.max(0, net - PAYROLL.THRESHOLD_NOK);
    const commission = commissionBase * PAYROLL.RATE;
    const base = st.base_salary_nok ?? PAYROLL.BASE_NOK;
    const ab = absence.get(st.id);
    const bs = baseSalaryForMonth(base, y, m, st.start_date, st.end_date, ab);
    const total = bs.effectiveBase + commission;
    tGross += g;
    tTotal += total;
    tComm += commission;
    rows.push({
      name: st.full_name,
      title: st.title,
      gross: r0(g),
      imported: r0(imported.get(st.id) ?? 0),
      net: r0(net),
      commissionBase: r0(commissionBase),
      commission: r0(commission),
      base: r0(base),
      employmentDeduction: r0(bs.employmentDeduction),
      absenceDays: ab?.absentDays ?? 0,
      workdays: ab?.workdays ?? 0,
      absenceDeduction: r0(bs.absenceDeduction),
      total: r0(total),
    });
  }
  rows.sort((a, b) => Number(b.total) - Number(a.total));

  return {
    totals: { gross: tGross, total: tTotal, commission: tComm },
    table: {
      title: `${MONTHS_NB[m - 1]} ${y}`,
      columns: [
        { key: "name", header: "Ansatt", type: "text" },
        { key: "title", header: "Tittel", type: "text" },
        { key: "gross", header: "Omsetning inkl. mva", type: "money", total: "sum" },
        { key: "imported", header: "Herav importert", type: "money", total: "sum" },
        { key: "net", header: "Omsetning eks. mva", type: "money", total: "sum" },
        { key: "commissionBase", header: "Over terskel", type: "money", total: "sum" },
        { key: "commission", header: "Provisjon", type: "money", total: "sum" },
        { key: "base", header: "Grunnlønn", type: "money", total: "sum" },
        { key: "employmentDeduction", header: "Trekk: ikke ansatt hele mnd", type: "money", total: "sum" },
        { key: "absenceDays", header: "Fraværsdager (trekk)", type: "int", total: "sum" },
        { key: "workdays", header: "Arbeidsdager", type: "int" },
        { key: "absenceDeduction", header: "Trekk: fravær", type: "money", total: "sum" },
        { key: "total", header: "Lønn totalt", type: "money", total: "sum" },
      ],
      rows,
      note: `Modell: grunnlønn (standard ${PAYROLL.BASE_NOK.toLocaleString("nb-NO")} kr) + ${PAYROLL.RATE * 100} % av omsetning eks. mva over ${PAYROLL.THRESHOLD_NOK.toLocaleString("nb-NO")} kr. Samme regler som lønnsslippene. Måneden avgrenses i UTC som i lønnsslippene. Individuelle provisjonsavtaler er ikke med her.`,
    },
  };
}

const lonnManed: ReportDef = {
  key: "lonn-maned",
  title: "Lønn – per måned",
  description: "Lønn per ansatt for hver måned i perioden: omsetning, provisjon, grunnlønn og trekk.",
  category: "Lønn",
  async build({ range, sb }) {
    const months = monthsIn(range.from, range.to);
    const tables: Table[] = [];
    const sum: Record<string, Cell>[] = [];
    const notes: string[] = [];
    for (const { y, m } of months) {
      try {
        const r = await payrollTable(sb, y, m);
        tables.push(r.table);
        sum.push({
          month: `${y}-${String(m).padStart(2, "0")}`,
          staff: r.table.rows.length,
          gross: r0(r.totals.gross),
          commission: r0(r.totals.commission),
          total: r0(r.totals.total),
        });
      } catch (e) {
        notes.push(`${MONTHS_NB[m - 1]} ${y} kunne ikke beregnes: ${e instanceof Error ? e.message : "feil"}.`);
      }
    }
    if (monthsIn(range.from, range.to).length >= MAX_MONTHS && +range.to.slice(0, 4) * 12 + +range.to.slice(5, 7) > +range.from.slice(0, 4) * 12 + +range.from.slice(5, 7) + MAX_MONTHS - 1) {
      notes.push(`Bare de første ${MAX_MONTHS} månedene i perioden er med.`);
    }
    const sheet: ReportSheet = {
      name: "Lønn per måned",
      title: "Lønn – per måned",
      subtitle: `${range.label} – hele kalendermåneder`,
      kpis: sum.length
        ? [
            { label: "Lønn totalt", value: sum.reduce((s, r) => s + Number(r.total), 0), type: "money" },
            { label: "Provisjon totalt", value: sum.reduce((s, r) => s + Number(r.commission), 0), type: "money" },
            { label: "Omsetning inkl. mva", value: sum.reduce((s, r) => s + Number(r.gross), 0), type: "money" },
          ]
        : undefined,
      tables: [
        {
          title: "Sammendrag per måned",
          columns: [
            { key: "month", header: "Måned", type: "text" },
            { key: "staff", header: "Ansatte", type: "int" },
            { key: "gross", header: "Omsetning inkl. mva", type: "money", total: "sum" },
            { key: "commission", header: "Provisjon", type: "money", total: "sum" },
            { key: "total", header: "Lønn totalt", type: "money", total: "sum" },
          ],
          rows: sum,
          note: ["Lønn beregnes alltid for hele kalendermåneder: alle måneder som perioden berører tas med, uavhengig av dag i måneden.", ...notes].join(" "),
        },
        ...tables,
      ],
    };
    return [sheet];
  },
};

/* -------------------------------- Fravær -------------------------------- */

type AbsR = {
  id: string;
  staff_id: string;
  from_date: string;
  to_date: string;
  kind?: string | null;
  staff: { full_name?: string } | { full_name?: string }[] | null;
};

const kindInfo = (k: string | null | undefined) => {
  const hit = ABSENCE_KINDS.find((x) => x.value === (k as AbsenceKind));
  return hit ?? { value: "annet" as AbsenceKind, label: "Annet", deduct: false };
};

const lonnFravaer: ReportDef = {
  key: "lonn-fravaer",
  title: "Lønn – fravær",
  description: "Fravær som overlapper perioden, per ansatt og type, og om det gir trekk i lønn.",
  category: "Lønn",
  async build({ range, sb }) {
    const notes: string[] = [];
    let rows: AbsR[] = [];
    const selects = [
      "id, staff_id, from_date, to_date, kind, staff(full_name)",
      "id, staff_id, from_date, to_date, staff(full_name)",
    ];
    let ok = false;
    for (let i = 0; i < selects.length && !ok; i++) {
      try {
        rows = await fetchAll<AbsR>(
          (f, t) =>
            sb
              .from("absences")
              .select(selects[i])
              .lte("from_date", range.to)
              .gte("to_date", range.from)
              .order("from_date")
              .order("id")
              .range(f, t) as unknown as Page<AbsR>,
        );
        ok = true;
        if (i > 0) notes.push("Fraværstype mangler i databasen – alt vises som «Annet».");
      } catch {
        /* neste */
      }
    }
    if (!ok) notes.push("Fravær kunne ikke hentes.");

    const nameOf = (r: AbsR) => (Array.isArray(r.staff) ? r.staff[0]?.full_name : r.staff?.full_name) ?? "—";
    type Item = { name: string; kind: string; deduct: boolean; from: string; to: string; days: number };
    const items: Item[] = rows
      .map((r) => {
        const from = r.from_date > range.from ? r.from_date : range.from;
        const to = r.to_date < range.to ? r.to_date : range.to;
        const k = kindInfo(r.kind);
        const days = from > to ? 0 : Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
        return { name: nameOf(r), kind: k.label, deduct: k.deduct, from: r.from_date, to: r.to_date, days };
      })
      .filter((i) => i.days > 0);

    const byStaff = new Map<string, Record<string, number>>();
    for (const i of items) {
      const o = byStaff.get(i.name) ?? {};
      o[i.kind] = (o[i.kind] ?? 0) + i.days;
      byStaff.set(i.name, o);
    }
    const kinds = ABSENCE_KINDS.map((k) => k.label);
    const deductDays = items.filter((i) => i.deduct).reduce((s, i) => s + i.days, 0);

    return [
      {
        name: "Fravær",
        title: "Lønn – fravær",
        subtitle: range.label,
        kpis: [
          { label: "Fraværsperioder", value: items.length, type: "int" },
          { label: "Fraværsdager (kalender)", value: items.reduce((s, i) => s + i.days, 0), type: "int", hint: "bare dager i perioden" },
          { label: "Dager som gir trekk", value: deductDays, type: "int", hint: "ulønnet og ugyldig" },
        ],
        tables: [
          {
            title: "Dager per ansatt og type",
            columns: [
              { key: "name", header: "Ansatt", type: "text" },
              ...kinds.map((k) => ({ key: k, header: k, type: "int" as const, total: "sum" as const })),
            ],
            rows: [...byStaff.entries()]
              .sort((a, b) => a[0].localeCompare(b[0], "nb"))
              .map(([name, o]) => ({ name, ...Object.fromEntries(kinds.map((k) => [k, o[k] ?? 0])) })),
            note:
              ["Kalenderdager, ikke arbeidsdager. Trekk i lønn beregnes på arbeidsdager i lønnsmodulen. Årsak tas ikke med.", ...notes].join(" "),
          },
          {
            title: "Fraværsperioder",
            columns: [
              { key: "name", header: "Ansatt", type: "text" },
              { key: "kind", header: "Type", type: "text" },
              { key: "from", header: "Fra", type: "date" },
              { key: "to", header: "Til", type: "date" },
              { key: "days", header: "Dager i perioden", type: "int", total: "sum" },
              { key: "deduct", header: "Gir trekk", type: "text" },
            ],
            rows: items
              .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.name.localeCompare(b.name, "nb")))
              .map((i) => ({ name: i.name, kind: i.kind, from: i.from, to: i.to, days: i.days, deduct: i.deduct ? "Ja" : "Nei" })),
          },
        ],
      },
    ];
  },
};

/* ------------------------------- Arbeidstid ------------------------------- */

type ShiftR = {
  staff_id: string;
  full_name: string;
  day: string;
  worked_minutes: number | string | null;
  events: number | null;
  open_shift: boolean | null;
};

const lonnArbeidstid: ReportDef = {
  key: "lonn-arbeidstid",
  title: "Lønn – arbeidstid",
  description: "Stemplet arbeidstid per ansatt og dag (inn/ut-stempling).",
  category: "Lønn",
  async build({ range, sb }) {
    let rows: ShiftR[] = [];
    let note: string | undefined;
    try {
      // PostgREST kutter RPC-svar ved 1000 rader – hent i sider.
      const out: ShiftR[] = [];
      for (let from = 0; from < 100_000; from += 1000) {
        const { data, error } = await sb
          .rpc("staff_shift_days", { p_from: range.from, p_to: range.to })
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        const page = (data as ShiftR[] | null) ?? [];
        out.push(...page);
        if (page.length < 1000) break;
      }
      rows = out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      note = /staff_shift_days|function|schema cache/i.test(msg)
        ? "Arbeidstid er ikke aktivert: kjør KJØR-I-SUPABASE-TVERS-AV-ROLLER.sql i Supabase."
        : `Arbeidstid kunne ikke hentes${msg ? `: ${msg}` : ""}.`;
    }

    const by = new Map<string, { name: string; min: number; days: number; open: number; events: number }>();
    for (const r of rows) {
      const m = Number(r.worked_minutes) || 0;
      let a = by.get(r.staff_id);
      if (!a) by.set(r.staff_id, (a = { name: r.full_name, min: 0, days: 0, open: 0, events: 0 }));
      a.min += m;
      if (m > 0) a.days++;
      if (r.open_shift) a.open++;
      a.events += Number(r.events) || 0;
    }
    const totalMin = [...by.values()].reduce((s, a) => s + a.min, 0);
    const h = (m: number) => Math.round((m / 60) * 100) / 100;

    return [
      {
        name: "Arbeidstid",
        title: "Lønn – arbeidstid",
        subtitle: range.label,
        kpis: [
          { label: "Stemplet tid (timer)", value: h(totalMin), type: "decimal" },
          { label: "Ansatte med stempling", value: by.size, type: "int" },
          { label: "Åpne vakter", value: [...by.values()].reduce((s, a) => s + a.open, 0), type: "int", hint: "ikke stemplet ut" },
        ],
        tables: [
          {
            title: "Per ansatt",
            columns: [
              { key: "name", header: "Ansatt", type: "text" },
              { key: "hours", header: "Timer", type: "decimal", total: "sum" },
              { key: "days", header: "Dager med arbeid", type: "int", total: "sum" },
              { key: "avg", header: "Snitt timer per dag", type: "decimal" },
              { key: "open", header: "Åpne vakter", type: "int", total: "sum" },
            ],
            rows: [...by.values()]
              .sort((a, b) => a.name.localeCompare(b.name, "nb"))
              .map((a) => ({ name: a.name, hours: h(a.min), days: a.days, avg: a.days ? h(a.min / a.days) : null, open: a.open })),
            note:
              note ??
              "Åpen vakt = stemplet inn uten å stemple ut; tiden fram til utstempling er ikke sikker. Kilde: RPC staff_shift_days (Oslo-dager).",
          },
          {
            title: "Per dag",
            columns: [
              { key: "day", header: "Dato", type: "date" },
              { key: "weekday", header: "Ukedag", type: "text" },
              { key: "name", header: "Ansatt", type: "text" },
              { key: "hours", header: "Timer", type: "decimal", total: "sum" },
              { key: "events", header: "Stemplinger", type: "int", total: "sum" },
              { key: "open", header: "Åpen vakt", type: "text" },
            ],
            rows: [...rows]
              .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.full_name.localeCompare(b.full_name, "nb")))
              .map((r) => ({
                day: String(r.day).slice(0, 10),
                weekday: WEEKDAYS[weekdayOf(String(r.day).slice(0, 10))],
                name: r.full_name,
                hours: h(Number(r.worked_minutes) || 0),
                events: Number(r.events) || 0,
                open: r.open_shift ? "Ja" : "",
              })),
          },
        ],
      },
    ];
  },
};

export const REPORTS: ReportDef[] = [lonnManed, lonnFravaer, lonnArbeidstid];
