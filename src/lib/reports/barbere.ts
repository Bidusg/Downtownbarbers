import { fetchAll, fetchAllSafe } from "@/lib/reports/fetch-all";
import { addSale, eachDay, emptyAgg, eksMva, loadSales, r2, BARBER_NETT, WEEKDAYS, weekdayOf } from "@/lib/reports/omsetning";
import type { Agg } from "@/lib/reports/omsetning";
import type { Range } from "@/lib/report-queries";
import type { Cell, ReportDef, ReportSheet, Supa } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTSENTER – BARBERE
 *   Bygger på loadSales (omsetning.ts) + egne, paginerte bookingspørringer.
 *   Priser i databasen er inkl. 25 % mva; omsetning vises eks. mva.
 *   Bookinger uten service_id (blokkeringer/pauser) telles aldri.
 *   Kapasitet kommer fra RPC turnus_capacity_minutes (tom ved feil).
 * ===================================================================== */

type Ctx = { range: Range; sb: Supa };
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

type BookingRow = {
  id: string;
  staff_id: string | null;
  customer_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  service_id: string | null;
};
type StaffRow = { id: string; full_name: string | null; title: string | null; active: boolean | null };

const NOTE_MVA = "Omsetning er eks. mva (databasepriser er inkl. 25 %). Annullerte salg og gavekortsalg er ikke med.";

async function loadBookings(sb: Supa, r: Range): Promise<BookingRow[]> {
  return fetchAllSafe<BookingRow>(
    (from, to) =>
      sb
        .from("bookings")
        .select("id, staff_id, customer_id, start_at, end_at, status, service_id")
        .gte("start_at", r.startIso)
        .lt("start_at", r.endIso)
        .not("service_id", "is", null)
        .order("start_at")
        .order("id")
        .range(from, to) as unknown as Page<BookingRow>,
  );
}

const STAFF_FAIL = "Kunne ikke lese ansatte (tabellen staff) – barbernavn vises som «Ukjent».";

/** Ansatte, eller tom liste + ok=false ved feil (så rapporten kan varsle). */
async function loadStaff(sb: Supa): Promise<{ staff: StaffRow[]; ok: boolean }> {
  try {
    const staff = await fetchAll<StaffRow>(
      (from, to) =>
        sb.from("staff").select("id, full_name, title, active").order("id").range(from, to) as unknown as Page<StaffRow>,
    );
    return { staff, ok: true };
  } catch {
    return { staff: [], ok: false };
  }
}

async function loadCapacity(sb: Supa, r: Range): Promise<Map<string, number> | null> {
  try {
    const { data, error } = await sb.rpc("turnus_capacity_minutes", { p_from: r.from, p_to: r.to });
    if (error) return null;
    const m = new Map<string, number>();
    for (const c of (data ?? []) as { staff_id: string; minutes: number }[]) m.set(c.staff_id, Number(c.minutes) || 0);
    return m;
  } catch {
    return null;
  }
}

const mins = (b: BookingRow) => Math.max(0, (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000);
const h1 = (m: number) => Math.round((m / 60) * 10) / 10;
const frac = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/* ---------------------------- Produktivitet ---------------------------- */

async function produktivitet({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const [{ sales, notes }, bookings, staffRes, cap] = await Promise.all([
    loadSales(sb, range),
    loadBookings(sb, range),
    loadStaff(sb),
    loadCapacity(sb, range),
  ]);

  const staff = staffRes.staff;
  const names = new Map<string, string>();
  const titles = new Map<string, string>();
  for (const s of staff) {
    names.set(s.id, s.full_name ?? "Ukjent");
    if (s.title) titles.set(s.id, s.title);
  }

  const agg = new Map<string, Agg>();
  for (const s of sales) {
    const k = s.staffId ?? "";
    agg.set(k, addSale(agg.get(k) ?? emptyAgg(), s));
  }

  type B = { done: number; noShow: number; bookedMin: number };
  const bk = new Map<string, B>();
  for (const b of bookings) {
    if (!b.staff_id) continue;
    const x = bk.get(b.staff_id) ?? { done: 0, noShow: 0, bookedMin: 0 };
    if (b.status === "completed") x.done += 1;
    else if (b.status === "no_show") x.noShow += 1;
    if (b.status === "completed" || b.status === "confirmed") x.bookedMin += mins(b);
    bk.set(b.staff_id, x);
  }

  const ids = new Set<string>([...agg.keys(), ...bk.keys(), ...(cap ? cap.keys() : [])]);
  for (const s of staff) if (s.active) ids.add(s.id);

  const rows = [...ids]
    .map((id) => {
      const a = agg.get(id) ?? emptyAgg();
      const b = bk.get(id) ?? { done: 0, noShow: 0, bookedMin: 0 };
      const capMin = cap?.get(id) ?? 0;
      const rev = eksMva(a.total);
      return {
        navn: id === "" ? BARBER_NETT : names.get(id) ?? "Ukjent",
        tittel: titles.get(id) ?? null,
        omsetning: rev,
        behandling: eksMva(a.svc),
        varer: eksMva(a.prod),
        salg: a.n,
        behandlinger: a.nSvc,
        snitt: a.n ? r2(rev / a.n) : null,
        fullforte: b.done,
        noshow: b.noShow,
        noshowPct: frac(b.noShow, b.done + b.noShow),
        booket: h1(b.bookedMin),
        kapasitet: h1(capMin),
        utnyttelse: frac(b.bookedMin, capMin),
        perTime: b.bookedMin > 0 ? r2(rev / (b.bookedMin / 60)) : null,
      };
    })
    .filter((r) => r.salg > 0 || r.fullforte > 0 || r.noshow > 0 || r.kapasitet > 0)
    .sort((a, b) => b.omsetning - a.omsetning);

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  const totRev = sum((r) => r.omsetning);
  const totBooked = sum((r) => r.booket);
  const totCap = sum((r) => r.kapasitet);
  const totDone = sum((r) => r.fullforte);
  const totNo = sum((r) => r.noshow);

  const extra: string[] = [...notes];
  if (!staffRes.ok) extra.push(STAFF_FAIL);
  if (!cap) extra.push("Kapasitet (turnus) kunne ikke leses – utnyttelse er tom.");
  else if (totCap === 0) extra.push("Ingen turnus/åpningstid registrert i perioden – utnyttelse er tom.");

  return [
    {
      name: "Barber-produktivitet",
      title: "Barber-produktivitet",
      subtitle: range.label,
      kpis: [
        { label: "Omsetning", value: r2(totRev), type: "money", hint: "eks. mva" },
        { label: "Fullførte bookinger", value: totDone, type: "int" },
        { label: "No-show", value: totNo, type: "int" },
        { label: "Utnyttelse", value: frac(totBooked, totCap), type: "pct", hint: "booket tid / turnus" },
      ],
      tables: [
        {
          columns: [
            { key: "navn", header: "Barber", type: "text" },
            { key: "tittel", header: "Tittel", type: "text" },
            { key: "omsetning", header: "Omsetning", type: "money", total: "sum" },
            { key: "behandling", header: "Behandling", type: "money", total: "sum" },
            { key: "varer", header: "Varer", type: "money", total: "sum" },
            { key: "salg", header: "Salg", type: "int", total: "sum" },
            { key: "behandlinger", header: "Behandlinger", type: "int", total: "sum" },
            { key: "snitt", header: "Snitt per salg", type: "money2" },
            { key: "fullforte", header: "Fullførte bookinger", type: "int", total: "sum" },
            { key: "noshow", header: "No-show", type: "int", total: "sum" },
            { key: "noshowPct", header: "No-show %", type: "pct" },
            { key: "booket", header: "Booket (t)", type: "decimal", total: "sum" },
            { key: "kapasitet", header: "Kapasitet (t)", type: "decimal", total: "sum" },
            { key: "utnyttelse", header: "Utnyttelse", type: "pct" },
            { key: "perTime", header: "Omsetning per booket time", type: "money" },
          ],
          rows,
          note: [
            NOTE_MVA,
            "Booket tid = fullførte + bekreftede bookinger med tjeneste. No-show % = no-show / (fullført + no-show).",
            ...extra,
          ].join(" "),
        },
      ],
    },
  ];
}

/* ---------------------------- Tjenester per barber ---------------------------- */

async function tjenesterPerBarber({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const m = new Map<string, { barber: string; tjeneste: string; kategori: string; antall: number; sum: number }>();
  for (const s of sales) {
    for (const l of s.lines) {
      if (l.kind !== "service") continue;
      const key = `${s.staffName}\u0000${l.name}`;
      const x = m.get(key) ?? { barber: s.staffName, tjeneste: l.name, kategori: l.category, antall: 0, sum: 0 };
      x.antall += l.qty;
      x.sum += l.net;
      m.set(key, x);
    }
  }
  const rows = [...m.values()]
    .map((x) => ({
      barber: x.barber,
      tjeneste: x.tjeneste,
      kategori: x.kategori,
      antall: x.antall,
      omsetning: eksMva(x.sum),
      snitt: x.antall ? eksMva(x.sum / x.antall) : null,
    }))
    .sort((a, b) => a.barber.localeCompare(b.barber, "nb") || b.omsetning - a.omsetning);
  return [
    {
      name: "Tjenester per barber",
      title: "Tjenester per barber",
      subtitle: range.label,
      tables: [
        {
          columns: [
            { key: "barber", header: "Barber", type: "text" },
            { key: "tjeneste", header: "Tjeneste", type: "text" },
            { key: "kategori", header: "Kategori", type: "text" },
            { key: "antall", header: "Antall", type: "int", total: "sum" },
            { key: "omsetning", header: "Omsetning", type: "money", total: "sum" },
            { key: "snitt", header: "Snittpris", type: "money2" },
          ],
          rows,
          note: [NOTE_MVA, "Kun behandlinger; rabatt er fordelt forholdsmessig på linjene.", ...notes].join(" "),
        },
      ],
    },
  ];
}

/* ---------------------------- Barber per dag ---------------------------- */

async function barberPerDag({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const { sales, notes } = await loadSales(sb, range);
  const byBarber = new Map<string, Map<string, number>>();
  for (const s of sales) {
    const d = byBarber.get(s.staffName) ?? new Map<string, number>();
    d.set(s.day, (d.get(s.day) ?? 0) + s.total);
    byBarber.set(s.staffName, d);
  }
  const barbers = [...byBarber.keys()].sort((a, b) => a.localeCompare(b, "nb"));
  const columns = [
    { key: "dato", header: "Dato", type: "date" as const },
    { key: "ukedag", header: "Ukedag", type: "text" as const },
    ...barbers.map((b, i) => ({ key: `b${i}`, header: b, type: "money" as const, total: "sum" as const })),
    { key: "sum", header: "Sum", type: "money" as const, total: "sum" as const },
  ];
  const rows = eachDay(range.from, range.to).map((d) => {
    const row: Record<string, Cell> = { dato: d, ukedag: WEEKDAYS[weekdayOf(d)] };
    let t = 0;
    barbers.forEach((b, i) => {
      const v = byBarber.get(b)?.get(d) ?? 0;
      t += v;
      row[`b${i}`] = eksMva(v);
    });
    row.sum = eksMva(t);
    return row;
  });
  return [
    {
      name: "Barber per dag",
      title: "Omsetning per barber per dag",
      subtitle: range.label,
      tables: [{ columns, rows, note: [NOTE_MVA, "Dager uten salg er tatt med (0).", ...notes].join(" ") }],
    },
  ];
}

/* ---------------------------- No-show ---------------------------- */

async function noShow({ range, sb }: Ctx): Promise<ReportSheet[]> {
  const [bookings, staffRes] = await Promise.all([loadBookings(sb, range), loadStaff(sb)]);
  const staff = staffRes.staff;
  const names = new Map(staff.map((s) => [s.id, s.full_name ?? "Ukjent"]));

  const per = new Map<string, { done: number; no: number }>();
  const cust = new Map<string, number>();
  for (const b of bookings) {
    if (b.status !== "completed" && b.status !== "no_show") continue;
    const n = b.staff_id ? names.get(b.staff_id) ?? "Ukjent" : "Uten barber";
    const x = per.get(n) ?? { done: 0, no: 0 };
    if (b.status === "completed") x.done += 1;
    else {
      x.no += 1;
      if (b.customer_id) cust.set(b.customer_id, (cust.get(b.customer_id) ?? 0) + 1);
    }
    per.set(n, x);
  }
  const rows = [...per.entries()]
    .map(([navn, x]) => ({ navn, fullforte: x.done, noshow: x.no, pct: frac(x.no, x.done + x.no) }))
    .sort((a, b) => b.noshow - a.noshow);
  const totDone = rows.reduce((t, r) => t + r.fullforte, 0);
  const totNo = rows.reduce((t, r) => t + r.noshow, 0);

  const repeatIds = [...cust.entries()].filter(([, n]) => n >= 2);
  const custNames = new Map<string, string>();
  if (repeatIds.length) {
    const ids = repeatIds.map(([id]) => id);
    const all = await fetchAllSafe<{ id: string; full_name: string | null }>(
      (from, to) =>
        sb.from("customers").select("id, full_name").in("id", ids).order("id").range(from, to) as unknown as Page<{
          id: string;
          full_name: string | null;
        }>,
    );
    for (const c of all) custNames.set(c.id, c.full_name ?? "Ukjent");
  }
  const repeatRows = repeatIds
    .map(([id, n]) => ({ kunde: custNames.get(id) ?? "Ukjent kunde", antall: n }))
    .sort((a, b) => b.antall - a.antall)
    .slice(0, 50);

  return [
    {
      name: "No-show",
      title: "No-show per barber",
      subtitle: range.label,
      kpis: [
        { label: "No-show totalt", value: totNo, type: "int" },
        { label: "No-show %", value: frac(totNo, totDone + totNo), type: "pct", hint: "av fullførte + no-show" },
      ],
      tables: [
        {
          columns: [
            { key: "navn", header: "Barber", type: "text" },
            { key: "fullforte", header: "Fullførte", type: "int", total: "sum" },
            { key: "noshow", header: "No-show", type: "int", total: "sum" },
            { key: "pct", header: "No-show %", type: "pct" },
          ],
          rows,
          note: ["Bookinger med tjeneste som starter i perioden. Blokkeringer og avlyste bookinger er ikke med.", ...(staffRes.ok ? [] : [STAFF_FAIL])].join(" "),
        },
        {
          title: "Kunder med 2 eller flere no-shows",
          columns: [
            { key: "kunde", header: "Kunde", type: "text" },
            { key: "antall", header: "No-shows", type: "int", total: "sum" },
          ],
          rows: repeatRows,
        },
      ],
    },
  ];
}

export const REPORTS: ReportDef[] = [
  {
    key: "barbere-produktivitet",
    title: "Barber-produktivitet",
    description: "Omsetning, salg, fullførte bookinger, no-show, booket tid og utnyttelse mot turnus per barber.",
    category: "Barbere",
    build: produktivitet,
  },
  {
    key: "barbere-tjenester",
    title: "Tjenester per barber",
    description: "Antall og omsetning per tjeneste for hver barber.",
    category: "Barbere",
    build: tjenesterPerBarber,
  },
  {
    key: "barbere-per-dag",
    title: "Omsetning per barber per dag",
    description: "Dag-for-dag-matrise med en kolonne per barber, eks. mva.",
    category: "Barbere",
    build: barberPerDag,
  },
  {
    key: "barbere-noshow",
    title: "No-show",
    description: "No-show per barber og kunder med gjentatte no-shows.",
    category: "Barbere",
    build: noShow,
  },
];
