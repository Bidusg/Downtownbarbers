import { fetchAll } from "@/lib/reports/fetch-all";
import { eachDay, osloDayHour, weekdayOf, WEEKDAYS } from "@/lib/reports/omsetning";
import type { Cell, ReportDef, ReportSheet, Supa } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTER – BOOKING
 *   Kilde: tabellen `bookings` (hentet i sider à 1000 med .range()).
 *   Dag = Oslo-dag for start_at.
 *   - «Blokkering» = rad uten kunde og uten tjeneste (pause/stengt). Telles ikke som booking.
 *   - «Drop-in» = tjeneste, men ingen kunde (opprettet i kassa).
 *   - bookings har ingen kanal-kolonne, så nett og kasse kan ikke skilles.
 *   Personvern: ingen kundenavn, telefon eller notater.
 * ===================================================================== */

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

type B = {
  id: string;
  staff_id: string | null;
  service_id: string | null;
  customer_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  price_nok?: number | string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avbestilt",
  no_show: "Uteblitt",
};

const MAX_DAYS_BELEGG = 92;

const pct = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const mins = (b: B): number => Math.max(0, (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000);
const hours = (m: number): number => Math.round((m / 60) * 10) / 10;

/** Cache per forespørsel så flere rapporter deler oppslag. */
const cache = new WeakMap<object, Map<string, Promise<unknown>>>();
function memo<T>(sb: Supa, key: string, fn: () => Promise<T>): Promise<T> {
  let m = cache.get(sb as object);
  if (!m) {
    m = new Map();
    cache.set(sb as object, m);
  }
  let p = m.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn();
    m.set(key, p);
  }
  return p;
}

async function loadBookings(sb: Supa, startIso: string, endIso: string): Promise<{ rows: B[]; notes: string[] }> {
  return memo(sb, `bookings:${startIso}:${endIso}`, async () => {
    const notes: string[] = [];
    const selects = [
      "id, staff_id, service_id, customer_id, start_at, end_at, status, price_nok, cancelled_at, cancelled_by",
      "id, staff_id, service_id, customer_id, start_at, end_at, status, price_nok",
    ];
    for (let i = 0; i < selects.length; i++) {
      try {
        const rows = await fetchAll<B>(
          (f, t) =>
            sb
              .from("bookings")
              .select(selects[i])
              .gte("start_at", startIso)
              .lt("start_at", endIso)
              .order("start_at")
              .order("id")
              .range(f, t) as unknown as Page<B>,
        );
        if (i > 0) notes.push("Tidspunkt/årsak for avbestilling mangler – kjør KJØR-I-SUPABASE-AVBESTILLINGER.sql.");
        return { rows: rows.map((r) => ({ ...r, status: String(r.status) })), notes };
      } catch {
        /* prøv neste */
      }
    }
    notes.push("Bookinger kunne ikke hentes.");
    return { rows: [], notes };
  });
}

const failedLookups = new WeakSet<Map<string, string>>();
const lookupNote = (m: Map<string, string>, what: string): string | undefined =>
  failedLookups.has(m) ? `${what} kunne ikke hentes – vises som «(ukjent)».` : undefined;

async function loadLookup(sb: Supa, table: "staff" | "services", col: "full_name" | "name"): Promise<Map<string, string>> {
  return memo(sb, table, async () => {
    const map = new Map<string, string>();
    try {
      const rows = await fetchAll<Record<string, string>>(
        (f, t) => sb.from(table).select(`id, ${col}`).order("id").range(f, t) as unknown as Page<Record<string, string>>,
      );
      for (const r of rows) map.set(r.id, r[col]);
    } catch {
      failedLookups.add(map);
    }
    return map;
  });
}
const loadStaff = (sb: Supa) => loadLookup(sb, "staff", "full_name");

const loadServices = (sb: Supa) => loadLookup(sb, "services", "name");

type Kind = "blokkering" | "dropin" | "booket";
/** Rad med kunde er alltid en booking (service_id settes null hvis tjenesten slettes). Uten kunde og uten tjeneste = blokkering. */
const kindOf = (b: B): Kind => (b.customer_id ? "booket" : !b.service_id ? "blokkering" : "dropin");
const isReal = (b: B) => kindOf(b) !== "blokkering";

type Counts = { total: number; completed: number; confirmed: number; pending: number; cancelled: number; noShow: number };
const emptyCounts = (): Counts => ({ total: 0, completed: 0, confirmed: 0, pending: 0, cancelled: 0, noShow: 0 });
function add(c: Counts, status: string) {
  c.total++;
  if (status === "completed") c.completed++;
  else if (status === "confirmed") c.confirmed++;
  else if (status === "pending") c.pending++;
  else if (status === "cancelled") c.cancelled++;
  else if (status === "no_show") c.noShow++;
}

const countCols = [
  { key: "total", header: "Bookinger", type: "int" as const, total: "sum" as const },
  { key: "completed", header: "Fullført", type: "int" as const, total: "sum" as const },
  { key: "confirmed", header: "Bekreftet", type: "int" as const, total: "sum" as const },
  { key: "pending", header: "Venter", type: "int" as const, total: "sum" as const },
  { key: "cancelled", header: "Avbestilt", type: "int" as const, total: "sum" as const },
  { key: "noShow", header: "Uteblitt", type: "int" as const, total: "sum" as const },
  { key: "cancelRate", header: "Avbestillingsandel", type: "pct" as const },
  { key: "noShowRate", header: "Uteblitt-andel", type: "pct" as const },
];
const countRow = (c: Counts): Record<string, Cell> => ({
  total: c.total,
  completed: c.completed,
  confirmed: c.confirmed,
  pending: c.pending,
  cancelled: c.cancelled,
  noShow: c.noShow,
  cancelRate: pct(c.cancelled, c.total),
  noShowRate: pct(c.noShow, c.total),
});

const noteList = (notes: string[]) => (notes.length ? notes.join(" ") : undefined);

/* ------------------------------ Sammendrag ------------------------------ */

const sammendrag: ReportDef = {
  key: "booking-sammendrag",
  title: "Booking – sammendrag",
  description: "Antall bookinger, status, avbestillinger, uteblitt og drop-in i perioden.",
  category: "Booking",
  async build({ range, sb }) {
    const { rows, notes } = await loadBookings(sb, range.startIso, range.endIso);
    const real = rows.filter(isReal);
    const all = emptyCounts();
    const byKind = new Map<Kind, Counts>();
    const customers = new Set<string>();
    let bookedMin = 0;
    for (const b of real) {
      add(all, b.status);
      const k = kindOf(b);
      let c = byKind.get(k);
      if (!c) byKind.set(k, (c = emptyCounts()));
      add(c, b.status);
      if (b.customer_id) customers.add(b.customer_id);
      if (b.status === "completed" || b.status === "confirmed") bookedMin += mins(b);
    }
    const blocks = rows.length - real.length;
    const kindLabel: Record<Kind, string> = { booket: "Booket time (med kunde)", dropin: "Drop-in (uten kunde)", blokkering: "Blokkering" };
    const sheet: ReportSheet = {
      name: "Booking sammendrag",
      title: "Booking – sammendrag",
      subtitle: range.label,
      kpis: [
        { label: "Bookinger", value: all.total, type: "int", hint: "eks. blokkeringer" },
        { label: "Fullført", value: all.completed, type: "int" },
        { label: "Avbestilt", value: all.cancelled, type: "int" },
        { label: "Avbestillingsandel", value: pct(all.cancelled, all.total), type: "pct" },
        { label: "Uteblitt", value: all.noShow, type: "int" },
        { label: "Uteblitt-andel", value: pct(all.noShow, all.total), type: "pct" },
        { label: "Unike kunder", value: customers.size, type: "int" },
        { label: "Booket tid (timer)", value: hours(bookedMin), type: "decimal", hint: "fullført + bekreftet" },
      ],
      tables: [
        {
          title: "Etter type",
          columns: [{ key: "kind", header: "Type", type: "text" }, ...countCols],
          rows: (["booket", "dropin"] as Kind[]).map((k) => ({ kind: kindLabel[k], ...countRow(byKind.get(k) ?? emptyCounts()) })),
          note: `Blokkeringer (pauser/stengt) er ikke regnet med: ${blocks} i perioden. Nett og kasse kan ikke skilles, bookings har ingen kanal-kolonne.`,
        },
        {
          title: "Etter status",
          columns: [
            { key: "status", header: "Status", type: "text" },
            { key: "n", header: "Antall", type: "int", total: "sum" },
            { key: "share", header: "Andel", type: "pct" },
          ],
          rows: Object.entries(STATUS_LABEL).map(([k, label]) => {
            const n = real.filter((b) => b.status === k).length;
            return { status: label, n, share: pct(n, all.total) };
          }),
          note: noteList(notes),
        },
      ],
    };
    return [sheet];
  },
};

/* --------------------------------- Dag --------------------------------- */

const dag: ReportDef = {
  key: "booking-dag",
  title: "Booking – per dag",
  description: "Antall bookinger, avbestillinger og uteblitt for hver dag.",
  category: "Booking",
  async build({ range, sb }) {
    const { rows, notes } = await loadBookings(sb, range.startIso, range.endIso);
    const byDay = new Map<string, Counts>();
    for (const d of eachDay(range.from, range.to)) byDay.set(d, emptyCounts());
    for (const b of rows.filter(isReal)) {
      const day = osloDayHour(b.start_at).day;
      let c = byDay.get(day);
      if (!c) byDay.set(day, (c = emptyCounts()));
      add(c, b.status);
    }
    const days = [...byDay.keys()].sort();
    const byWd = Array.from({ length: 7 }, () => emptyCounts());
    for (const d of days) {
      const c = byDay.get(d)!;
      const w = byWd[weekdayOf(d)];
      w.total += c.total;
      w.completed += c.completed;
      w.confirmed += c.confirmed;
      w.pending += c.pending;
      w.cancelled += c.cancelled;
      w.noShow += c.noShow;
    }
    return [
      {
        name: "Booking per dag",
        title: "Booking – per dag",
        subtitle: range.label,
        tables: [
          {
            title: "Per dag",
            columns: [
              { key: "day", header: "Dato", type: "date" },
              { key: "weekday", header: "Ukedag", type: "text" },
              ...countCols,
            ],
            rows: days.map((d) => ({ day: d, weekday: WEEKDAYS[weekdayOf(d)], ...countRow(byDay.get(d)!) })),
            note: noteList(notes),
          },
          {
            title: "Per ukedag",
            columns: [{ key: "weekday", header: "Ukedag", type: "text" }, ...countCols],
            rows: WEEKDAYS.map((w, i) => ({ weekday: w, ...countRow(byWd[i]) })),
          },
        ],
      },
    ];
  },
};

/* -------------------------------- Barber -------------------------------- */

const barber: ReportDef = {
  key: "booking-barber",
  title: "Booking – per barber",
  description: "Bookinger, avbestillinger, uteblitt, drop-in og booket tid per barber.",
  category: "Booking",
  async build({ range, sb }) {
    const [{ rows, notes }, staff] = await Promise.all([loadBookings(sb, range.startIso, range.endIso), loadStaff(sb)]);
    type A = Counts & { dropin: number; min: number; price: number };
    const by = new Map<string, A>();
    for (const b of rows.filter(isReal)) {
      const key = b.staff_id ?? "";
      let a = by.get(key);
      if (!a) by.set(key, (a = { ...emptyCounts(), dropin: 0, min: 0, price: 0 }));
      add(a, b.status);
      if (kindOf(b) === "dropin") a.dropin++;
      if (b.status === "completed" || b.status === "confirmed") {
        a.min += mins(b);
        a.price += Number(b.price_nok) || 0;
      }
    }
    const list = [...by.entries()]
      .map(([id, a]) => ({ name: id ? staff.get(id) ?? "(ukjent)" : "(ingen barber)", a }))
      .sort((x, y) => y.a.total - x.a.total);
    return [
      {
        name: "Booking per barber",
        title: "Booking – per barber",
        subtitle: range.label,
        tables: [
          {
            columns: [
              { key: "name", header: "Barber", type: "text" },
              ...countCols,
              { key: "dropin", header: "Herav drop-in", type: "int", total: "sum" },
              { key: "hours", header: "Booket tid (timer)", type: "decimal", total: "sum" },
              { key: "price", header: "Bookingverdi (kr)", type: "money", total: "sum" },
            ],
            rows: list.map(({ name, a }) => ({
              name,
              ...countRow(a),
              dropin: a.dropin,
              hours: hours(a.min),
              price: Math.round(a.price),
            })),
            note: [
              "Booket tid og verdi gjelder fullførte og bekreftede bookinger. Verdi er bookingens pris (inkl. mva), ikke faktisk salg.",
              noteList(notes),
              lookupNote(staff, "Barbernavn"),
            ]
              .filter(Boolean)
              .join(" "),
          },
        ],
      },
    ];
  },
};

/* ------------------------------- Tjenester ------------------------------- */

const tjenester: ReportDef = {
  key: "booking-tjenester",
  title: "Booking – tjenester",
  description: "Hvilke tjenester som bookes mest, med avbestilling og uteblitt per tjeneste.",
  category: "Booking",
  async build({ range, sb }) {
    const [{ rows, notes }, services] = await Promise.all([loadBookings(sb, range.startIso, range.endIso), loadServices(sb)]);
    type A = Counts & { min: number; price: number };
    const by = new Map<string, A>();
    for (const b of rows.filter(isReal)) {
      const key = b.service_id ?? "";
      let a = by.get(key);
      if (!a) by.set(key, (a = { ...emptyCounts(), min: 0, price: 0 }));
      add(a, b.status);
      if (b.status === "completed" || b.status === "confirmed") {
        a.min += mins(b);
        a.price += Number(b.price_nok) || 0;
      }
    }
    const list = [...by.entries()]
      .map(([id, a]) => ({ name: services.get(id) ?? "(ukjent tjeneste)", a }))
      .sort((x, y) => y.a.total - x.a.total);
    let addons = 0;
    let addonsFailed = false;
    try {
      const ids = rows.filter((b) => b.customer_id || b.service_id).filter((b) => b.status !== "cancelled").map((b) => b.id);
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const got = await fetchAll<{ id: string }>(
          (f, t) => sb.from("booking_addons").select("id").in("booking_id", chunk).order("id").range(f, t) as unknown as Page<{ id: string }>,
        );
        addons += got.length;
      }
    } catch {
      addonsFailed = true;
    }
    const total = list.reduce((s, x) => s + x.a.total, 0);
    return [
      {
        name: "Booking tjenester",
        title: "Booking – tjenester",
        subtitle: range.label,
        kpis: [
          { label: "Bookinger", value: total, type: "int" },
          { label: "Ulike tjenester", value: list.length, type: "int" },
          { label: "Tillegg på ikke-avbestilte", value: addons, type: "int", hint: "booking_addons" },
        ],
        tables: [
          {
            columns: [
              { key: "name", header: "Tjeneste", type: "text" },
              ...countCols,
              { key: "share", header: "Andel av bookinger", type: "pct" },
              { key: "hours", header: "Booket tid (timer)", type: "decimal", total: "sum" },
              { key: "price", header: "Bookingverdi (kr)", type: "money", total: "sum" },
            ],
            rows: list.map(({ name, a }) => ({
              name,
              ...countRow(a),
              share: pct(a.total, total),
              hours: hours(a.min),
              price: Math.round(a.price),
            })),
            note: [noteList(notes), lookupNote(services, "Tjenestenavn"), addonsFailed ? "Tillegg (booking_addons) kunne ikke telles – KPI-en er ufullstendig." : undefined]
              .filter(Boolean)
              .join(" ") || undefined,
          },
        ],
      },
    ];
  },
};

/* ----------------------------- Avbestillinger ----------------------------- */

const avbestillinger: ReportDef = {
  key: "booking-avbestillinger",
  title: "Booking – avbestillinger",
  description: "Avbestillinger og uteblitt: hvem som avbestilte, hvor tidlig, og per barber.",
  category: "Booking",
  async build({ range, sb }) {
    const [{ rows, notes }, staff] = await Promise.all([loadBookings(sb, range.startIso, range.endIso), loadStaff(sb)]);
    const real = rows.filter(isReal);
    const cancelled = real.filter((b) => b.status === "cancelled");
    const noShow = real.filter((b) => b.status === "no_show");

    const who = { customer: 0, staff: 0, unknown: 0 };
    const lead = [
      { label: "Mindre enn 2 timer før", n: 0 },
      { label: "2–24 timer før", n: 0 },
      { label: "1–2 døgn før", n: 0 },
      { label: "Mer enn 2 døgn før", n: 0 },
      { label: "Ukjent tidspunkt", n: 0 },
    ];
    for (const b of cancelled) {
      if (b.cancelled_by === "customer") who.customer++;
      else if (b.cancelled_by === "staff") who.staff++;
      else who.unknown++;
      if (!b.cancelled_at) {
        lead[4].n++;
        continue;
      }
      const h = (new Date(b.start_at).getTime() - new Date(b.cancelled_at).getTime()) / 3_600_000;
      if (h < 2) lead[0].n++;
      else if (h < 24) lead[1].n++;
      else if (h < 48) lead[2].n++;
      else lead[3].n++;
    }

    const byStaff = new Map<string, { total: number; c: number; n: number }>();
    for (const b of real) {
      const key = b.staff_id ?? "";
      let a = byStaff.get(key);
      if (!a) byStaff.set(key, (a = { total: 0, c: 0, n: 0 }));
      a.total++;
      if (b.status === "cancelled") a.c++;
      if (b.status === "no_show") a.n++;
    }
    const lostValue = [...cancelled, ...noShow].reduce((s, b) => s + (Number(b.price_nok) || 0), 0);

    return [
      {
        name: "Avbestillinger",
        title: "Booking – avbestillinger og uteblitt",
        subtitle: range.label,
        kpis: [
          { label: "Avbestilt", value: cancelled.length, type: "int" },
          { label: "Avbestillingsandel", value: pct(cancelled.length, real.length), type: "pct" },
          { label: "Uteblitt", value: noShow.length, type: "int" },
          { label: "Uteblitt-andel", value: pct(noShow.length, real.length), type: "pct" },
          { label: "Bookingverdi tapt", value: Math.round(lostValue), type: "money", hint: "avbestilt + uteblitt, inkl. mva" },
        ],
        tables: [
          {
            title: "Hvem avbestilte",
            columns: [
              { key: "who", header: "Avbestilt av", type: "text" },
              { key: "n", header: "Antall", type: "int", total: "sum" },
            ],
            rows: [
              { who: "Kunde", n: who.customer },
              { who: "Salong/ansatt", n: who.staff },
              { who: "Ukjent (før avbestillingssporing)", n: who.unknown },
            ],
            note: [noteList(notes), lookupNote(staff, "Barbernavn")].filter(Boolean).join(" ") || undefined,
          },
          {
            title: "Hvor tidlig før timen",
            columns: [
              { key: "label", header: "Varsel", type: "text" },
              { key: "n", header: "Antall", type: "int", total: "sum" },
            ],
            rows: lead.map((l) => ({ label: l.label, n: l.n })),
          },
          {
            title: "Per barber",
            columns: [
              { key: "name", header: "Barber", type: "text" },
              { key: "total", header: "Bookinger", type: "int", total: "sum" },
              { key: "c", header: "Avbestilt", type: "int", total: "sum" },
              { key: "cRate", header: "Avbestillingsandel", type: "pct" },
              { key: "n", header: "Uteblitt", type: "int", total: "sum" },
              { key: "nRate", header: "Uteblitt-andel", type: "pct" },
            ],
            rows: [...byStaff.entries()]
              .map(([id, a]) => ({
                name: id ? staff.get(id) ?? "(ukjent)" : "(ingen barber)",
                total: a.total,
                c: a.c,
                cRate: pct(a.c, a.total),
                n: a.n,
                nRate: pct(a.n, a.total),
              }))
              .sort((x, y) => y.c + y.n - (x.c + x.n)),
          },
        ],
      },
    ];
  },
};

/* --------------------------------- Belegg --------------------------------- */

const belegg: ReportDef = {
  key: "booking-belegg",
  title: "Booking – belegg",
  description: "Booket tid mot turnuskapasitet per barber, og per dag for perioder opp til 92 dager.",
  category: "Booking",
  async build({ range, sb }) {
    const [{ rows, notes }, staff] = await Promise.all([loadBookings(sb, range.startIso, range.endIso), loadStaff(sb)]);
    const days = eachDay(range.from, range.to);
    const booked = rows.filter((b) => b.service_id && (b.status === "completed" || b.status === "confirmed"));

    const bookedByStaff = new Map<string, number>();
    const bookedByDay = new Map<string, number>();
    for (const b of booked) {
      const m = mins(b);
      if (b.staff_id) bookedByStaff.set(b.staff_id, (bookedByStaff.get(b.staff_id) ?? 0) + m);
      const d = osloDayHour(b.start_at).day;
      bookedByDay.set(d, (bookedByDay.get(d) ?? 0) + m);
    }

    type Cap = { staff_id: string; minutes: number | string };
    const capCall = async (from: string, to: string): Promise<Cap[] | null> => {
      try {
        const { data, error } = await sb.rpc("turnus_capacity_minutes", { p_from: from, p_to: to });
        if (error) return null;
        return (data as Cap[] | null) ?? [];
      } catch {
        return null;
      }
    };

    const capTotal = await capCall(range.from, range.to);
    const out: ReportSheet["tables"] = [];
    const sheetNotes = [...notes, lookupNote(staff, "Barbernavn")].filter((x): x is string => !!x);
    let capSum = 0;
    if (capTotal === null) {
      sheetNotes.push("Turnuskapasitet kunne ikke hentes (RPC turnus_capacity_minutes). Belegg vises ikke.");
    }
    const capByStaff = new Map<string, number>();
    for (const c of capTotal ?? []) {
      const m = Number(c.minutes) || 0;
      capByStaff.set(c.staff_id, m);
      capSum += m;
    }
    const staffIds = new Set<string>([...capByStaff.keys(), ...bookedByStaff.keys()]);
    out.push({
      title: "Per barber",
      columns: [
        { key: "name", header: "Barber", type: "text" },
        { key: "cap", header: "Kapasitet (timer)", type: "decimal", total: "sum" },
        { key: "booked", header: "Booket (timer)", type: "decimal", total: "sum" },
        { key: "occ", header: "Belegg", type: "pct" },
      ],
      rows: [...staffIds]
        .map((id) => {
          const cap = capByStaff.get(id) ?? 0;
          const bk = bookedByStaff.get(id) ?? 0;
          return { name: staff.get(id) ?? "(ukjent)", cap: hours(cap), booked: hours(bk), occ: pct(bk, cap) as Cell };
        })
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "nb")),
      note: "Kapasitet = turnustimer (RPC turnus_capacity_minutes). Booket = fullførte og bekreftede bookinger med tjeneste. Drop-in uten kunde er med.",
    });

    if (capTotal !== null) {
      if (days.length <= MAX_DAYS_BELEGG) {
        const capByDay = new Map<string, number>();
        for (let i = 0; i < days.length; i += 5) {
          const chunk = days.slice(i, i + 5);
          const res = await Promise.all(chunk.map((d) => capCall(d, d)));
          chunk.forEach((d, j) => {
            capByDay.set(d, (res[j] ?? []).reduce((s, c) => s + (Number(c.minutes) || 0), 0));
          });
        }
        // Ingen eksisterende RPC gir kapasitet per dag i ett kall (turnus_capacity_minutes summerer per ansatt),
        // så vi tar ett kall per dag, fem om gangen (maks 92 dager).
        out.push({
          title: "Per dag",
          columns: [
            { key: "day", header: "Dato", type: "date" },
            { key: "weekday", header: "Ukedag", type: "text" },
            { key: "cap", header: "Kapasitet (timer)", type: "decimal", total: "sum" },
            { key: "booked", header: "Booket (timer)", type: "decimal", total: "sum" },
            { key: "occ", header: "Belegg", type: "pct" },
          ],
          rows: days.map((d) => {
            const cap = capByDay.get(d) ?? 0;
            const bk = bookedByDay.get(d) ?? 0;
            return { day: d, weekday: WEEKDAYS[weekdayOf(d)], cap: hours(cap), booked: hours(bk), occ: pct(bk, cap) };
          }),
        });
      } else {
        sheetNotes.push(`Belegg per dag vises bare for perioder på høyst ${MAX_DAYS_BELEGG} dager (perioden er ${days.length} dager).`);
      }
    }

    const bookedTotal = [...bookedByStaff.values()].reduce((s, v) => s + v, 0);
    if (sheetNotes.length && out.length) {
      const last = out[out.length - 1];
      last.note = [last.note, sheetNotes.join(" ")].filter(Boolean).join(" ");
    }
    return [
      {
        name: "Booking belegg",
        title: "Booking – belegg",
        subtitle: range.label,
        kpis: [
          { label: "Kapasitet (timer)", value: hours(capSum), type: "decimal" },
          { label: "Booket (timer)", value: hours(bookedTotal), type: "decimal" },
          { label: "Belegg", value: pct(bookedTotal, capSum), type: "pct" },
        ],
        tables: out,
      },
    ];
  },
};


export const REPORTS: ReportDef[] = [sammendrag, dag, barber, tjenester, avbestillinger, belegg];
