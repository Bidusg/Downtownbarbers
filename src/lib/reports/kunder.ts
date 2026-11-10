import { fetchAll } from "@/lib/reports/fetch-all";
import type { Cell, ReportDef, ReportSheet, Supa } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTER – KUNDER
 *   Kilde for «besøk» og «forbruk» er kassesalg (`sales` med kunde).
 *   Alle sider hentes med .range() (PostgREST gir maks 1000 rader).
 *   Personvern: kun navn, aldri telefon/e-post/notater/tokens.
 * ===================================================================== */

const OSLO = "Europe/Oslo";
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: OSLO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Oslo-dato "YYYY-MM-DD" for et UTC-tidspunkt. */
const osloDay = (iso: string): string => dayFmt.format(new Date(iso));

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/** Alle månedsnøkler "YYYY-MM" fra første til siste dato (inklusiv). */
function monthKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  const ey = +to.slice(0, 4);
  const em = +to.slice(5, 7);
  while ((y < ey || (y === ey && m <= em)) && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Prøver select-strenger i rekkefølge (siste = minste). Kaster hvis alle feiler. */
async function fetchFallback<T>(
  selects: string[],
  make: (select: string) => (from: number, to: number) => Page<T>,
): Promise<{ rows: T[]; used: number }> {
  let last: unknown = null;
  for (let i = 0; i < selects.length; i++) {
    try {
      return { rows: await fetchAll<T>(make(selects[i])), used: i };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Henting feilet");
}

/** Cache per forespørsel (samme sb) så flere rapporter deler tunge oppslag. */
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

/* ------------------------------ Data ------------------------------ */

type Cust = {
  id: string;
  name: string;
  source: string | null;
  consent: boolean;
  firstVisit: string | null; // customers.first_visit
  created: string; // Oslo-dato
  legacyVisits: number;
};

async function loadCustomers(sb: Supa): Promise<Cust[]> {
  return memo(sb, "customers", async () => {
    type R = {
      id: string;
      full_name: string | null;
      source?: string | null;
      marketing_consent?: boolean | null;
      first_visit?: string | null;
      created_at: string;
      legacy_visits?: number | null;
    };
    const { rows } = await fetchFallback<R>(
      [
        "id, full_name, source, marketing_consent, first_visit, created_at, legacy_visits",
        "id, full_name, source, marketing_consent, first_visit, created_at",
        "id, full_name, source, marketing_consent, created_at",
        "id, full_name, created_at",
      ],
      (sel) => (f, t) => sb.from("customers").select(sel).order("id").range(f, t) as unknown as Page<R>,
    );
    return rows.map((r) => ({
      id: r.id,
      name: (r.full_name ?? "").trim() || "(uten navn)",
      source: r.source?.trim() || null,
      consent: r.marketing_consent === true,
      firstVisit: r.first_visit ? String(r.first_visit).slice(0, 10) : null,
      created: osloDay(r.created_at),
      legacyVisits: Number(r.legacy_visits) || 0,
    }));
  });
}

const failedStaff = new WeakSet<Map<string, string>>();
const staffNote = (m: Map<string, string>) =>
  failedStaff.has(m) ? " Barbernavn kunne ikke hentes – favorittbarber vises som «—»." : "";

async function loadStaffNames(sb: Supa): Promise<Map<string, string>> {
  return memo(sb, "staff", async () => {
    const map = new Map<string, string>();
    try {
      const rows = await fetchAll<{ id: string; full_name: string }>(
        (f, t) => sb.from("staff").select("id, full_name").order("id").range(f, t) as unknown as Page<{ id: string; full_name: string }>,
      );
      for (const r of rows) map.set(r.id, r.full_name);
    } catch {
      failedStaff.add(map);
    }
    return map;
  });
}

type SaleRow = {
  customer_id: string;
  staff_id: string | null;
  total_nok: number | string | null;
  sold_at: string;
};

/** Alle kundesalg fram til periodens slutt (trengs for første/siste besøk og historisk forbruk). */
async function loadSalesUpTo(sb: Supa, endIso: string): Promise<SaleRow[]> {
  return memo(sb, `sales<${endIso}`, () =>
    fetchAll<SaleRow>(
      (f, t) =>
        sb
          .from("sales")
          .select("customer_id, staff_id, total_nok, sold_at")
          .not("customer_id", "is", null)
          .lt("sold_at", endIso)
          .order("sold_at")
          .order("id")
          .range(f, t) as unknown as Page<SaleRow>,
    ),
  );
}

type Agg = {
  first: string; // Oslo-dato første salg
  last: string; // Oslo-dato siste salg
  visits: number;
  spend: number;
  pVisits: number; // i perioden
  pSpend: number;
  byStaff: Map<string, { v: number; s: number }>;
};

function aggregate(sales: SaleRow[], startMs: number): Map<string, Agg> {
  const out = new Map<string, Agg>();
  for (const s of sales) {
    const day = osloDay(s.sold_at);
    const amt = Number(s.total_nok) || 0;
    let a = out.get(s.customer_id);
    if (!a) {
      a = { first: day, last: day, visits: 0, spend: 0, pVisits: 0, pSpend: 0, byStaff: new Map() };
      out.set(s.customer_id, a);
    }
    if (day < a.first) a.first = day;
    if (day > a.last) a.last = day;
    a.visits++;
    a.spend += amt;
    if (new Date(s.sold_at).getTime() >= startMs) {
      a.pVisits++;
      a.pSpend += amt;
    }
    if (s.staff_id) {
      const b = a.byStaff.get(s.staff_id) ?? { v: 0, s: 0 };
      b.v++;
      b.s += amt;
      a.byStaff.set(s.staff_id, b);
    }
  }
  return out;
}

function favourite(a: Agg | undefined, staff: Map<string, string>): string {
  if (!a || a.byStaff.size === 0) return "—";
  let best: string | null = null;
  let bv = -1;
  let bs = -1;
  for (const [id, x] of a.byStaff) {
    if (x.v > bv || (x.v === bv && x.s > bs)) {
      best = id;
      bv = x.v;
      bs = x.s;
    }
  }
  return (best && staff.get(best)) || "—";
}

/** Første besøk: tidligste av customers.first_visit og første kassesalg. */
function firstVisitOf(c: Cust, a: Agg | undefined): string | null {
  const cand = [c.firstVisit, a?.first ?? null].filter((x): x is string => !!x);
  return cand.length ? cand.sort()[0] : null;
}

const yesNo = (b: boolean) => (b ? "Ja" : "Nei");

function failSheet(name: string, title: string, msg: string): ReportSheet[] {
  return [
    {
      name,
      title,
      subtitle: "Rapporten kunne ikke lages",
      tables: [
        {
          columns: [{ key: "msg", header: "Melding", type: "text", width: 90 }],
          rows: [{ msg }],
        },
      ],
    },
  ];
}

/* ----------------------------- Rapporter ----------------------------- */

const sammendrag: ReportDef = {
  key: "kunder-sammendrag",
  title: "Kunder – sammendrag",
  description: "Unike, nye og gjengangere, snitt besøk og forbruk, nye kunder per måned og kilde («Hvordan hørte du om oss»).",
  category: "Kunder",
  async build({ range, sb }) {
    try {
      const [customers, sales] = await Promise.all([loadCustomers(sb), loadSalesUpTo(sb, range.endIso)]);
      const startMs = new Date(range.startIso).getTime();
      const agg = aggregate(sales, startMs);
      const custById = new Map(customers.map((c) => [c.id, c]));

      let unique = 0;
      let newCust = 0;
      let returning = 0;
      let pVisits = 0;
      let pSpend = 0;
      let registered = 0;
      const months = monthKeys(range.from, range.to);
      const perMonth = new Map(months.map((m) => [m, { nye: 0, reg: 0, uniq: 0, visits: 0, spend: 0 }]));
      const inRange = (d: string | null) => !!d && d >= range.from && d <= range.to;

      for (const c of customers) {
        if (inRange(c.created)) {
          registered++;
          const pm = perMonth.get(c.created.slice(0, 7));
          if (pm) pm.reg++;
        }
      }

      type SrcAgg = { label: string; reg: number; nye: number; uniq: number; spend: number };
      const bySource = new Map<string, SrcAgg>();
      const srcOf = (c: Cust | undefined) => {
        const label = c?.source || "Ikke oppgitt";
        const key = label.toLocaleLowerCase("nb-NO");
        let s = bySource.get(key);
        if (!s) {
          s = { label, reg: 0, nye: 0, uniq: 0, spend: 0 };
          bySource.set(key, s);
        }
        return s;
      };
      for (const c of customers) if (inRange(c.created)) srcOf(c).reg++;

      for (const [id, a] of agg) {
        if (a.pVisits <= 0) continue;
        const c = custById.get(id);
        unique++;
        pVisits += a.pVisits;
        pSpend += a.pSpend;
        const fv = c ? firstVisitOf(c, a) : a.first;
        const hadBefore = (fv !== null && fv < range.from) || (c?.legacyVisits ?? 0) > 0;
        if (hadBefore || a.pVisits >= 2) returning++;
        const src = srcOf(c);
        src.uniq++;
        src.spend += a.pSpend;
      }
      // Nye kunder (første besøk i perioden), også fordelt på måned og kilde
      for (const c of customers) {
        const fv = firstVisitOf(c, agg.get(c.id));
        if (!fv || !inRange(fv)) continue;
        newCust++;
        srcOf(c).nye++;
        const pm = perMonth.get(fv.slice(0, 7));
        if (pm) pm.nye++;
      }
      // Besøk/omsetning per måned (krever salgsradene)
      const seenInMonth = new Map<string, Set<string>>();
      for (const s of sales) {
        if (new Date(s.sold_at).getTime() < startMs) continue;
        const mk = osloDay(s.sold_at).slice(0, 7);
        const pm = perMonth.get(mk);
        if (!pm) continue;
        pm.visits++;
        pm.spend += Number(s.total_nok) || 0;
        let set = seenInMonth.get(mk);
        if (!set) seenInMonth.set(mk, (set = new Set()));
        set.add(s.customer_id);
      }
      for (const [mk, set] of seenInMonth) perMonth.get(mk)!.uniq = set.size;

      const srcRows = [...bySource.values()]
        .filter((s) => s.reg + s.uniq > 0)
        .sort((a, b) => b.reg - a.reg || b.uniq - a.uniq);

      return [
        {
          name: "Kunder sammendrag",
          title: "Kunder – sammendrag",
          subtitle: range.label,
          kpis: [
            { label: "Unike kunder med besøk", value: unique, type: "int", hint: "kunder med minst ett kassesalg i perioden" },
            { label: "Nye kunder", value: newCust, type: "int", hint: "første besøk i perioden" },
            { label: "Nyregistrerte kunder", value: registered, type: "int", hint: "opprettet i perioden (også uten besøk)" },
            { label: "Gjengangere", value: returning, type: "int", hint: "besøkt før perioden eller 2+ ganger i perioden" },
            { label: "Andel gjengangere", value: unique ? returning / unique : null, type: "pct" },
            { label: "Snitt besøk per kunde", value: unique ? pVisits / unique : null, type: "decimal" },
            { label: "Snitt forbruk per kunde", value: unique ? pSpend / unique : null, type: "money2", hint: "inkl. mva" },
          ],
          tables: [
            {
              title: "Kunder per måned",
              columns: [
                { key: "month", header: "Måned", type: "text", width: 12 },
                { key: "nye", header: "Nye kunder (første besøk)", type: "int", total: "sum" },
                { key: "reg", header: "Nyregistrerte", type: "int", total: "sum" },
                { key: "uniq", header: "Unike besøkende", type: "int" },
                { key: "visits", header: "Besøk", type: "int", total: "sum" },
                { key: "spend", header: "Omsetning inkl. mva", type: "money", total: "sum" },
              ],
              rows: months.map((m) => {
                const x = perMonth.get(m)!;
                return { month: m, nye: x.nye, reg: x.reg, uniq: x.uniq, visits: x.visits, spend: x.spend };
              }),
              note:
                "Første besøk = tidligste av kundekortets første besøk og første kassesalg. Unike besøkende kan ikke summeres på tvers av måneder.",
            },
            {
              title: "Kunder etter kilde («Hvordan hørte du om oss»)",
              columns: [
                { key: "source", header: "Kilde", type: "text", width: 28 },
                { key: "reg", header: "Nyregistrerte", type: "int", total: "sum" },
                { key: "share", header: "Andel av nyregistrerte", type: "pct" },
                { key: "nye", header: "Nye kunder (første besøk)", type: "int", total: "sum" },
                { key: "uniq", header: "Besøkende i perioden", type: "int", total: "sum" },
                { key: "spend", header: "Omsetning inkl. mva", type: "money", total: "sum" },
              ],
              rows: srcRows.map((s) => ({
                source: s.label,
                reg: s.reg,
                share: registered ? s.reg / registered : null,
                nye: s.nye,
                uniq: s.uniq,
                spend: s.spend,
              })),
              note:
                "Kilde er det kunden oppga ved booking (customers.source). «Ikke oppgitt» = importerte kunder og kunder uten svar.",
            },
          ],
        },
      ];
    } catch (e) {
      return failSheet("Kunder sammendrag", "Kunder – sammendrag", e instanceof Error ? e.message : "Ukjent feil");
    }
  },
};

const topp: ReportDef = {
  key: "kunder-topp",
  title: "Kunder – gullkunder (topp 50)",
  description: "De 50 kundene med høyest forbruk i perioden, med besøk og favorittbarber.",
  category: "Kunder",
  async build({ range, sb }) {
    try {
      const [customers, sales, staff] = await Promise.all([
        loadCustomers(sb),
        loadSalesUpTo(sb, range.endIso),
        loadStaffNames(sb),
      ]);
      const agg = aggregate(sales, new Date(range.startIso).getTime());
      const custById = new Map(customers.map((c) => [c.id, c]));
      const top = [...agg.entries()]
        .filter(([, a]) => a.pSpend > 0)
        .sort((x, y) => y[1].pSpend - x[1].pSpend)
        .slice(0, 50);
      const rows: Record<string, Cell>[] = top.map(([id, a], i) => {
        const c = custById.get(id);
        return {
          rank: i + 1,
          name: c?.name ?? "(ukjent kunde)",
          visits: a.pVisits,
          spend: a.pSpend,
          avg: a.pVisits ? a.pSpend / a.pVisits : null,
          first: c ? firstVisitOf(c, a) : a.first,
          last: a.last,
          fav: favourite(a, staff),
          consent: yesNo(c?.consent ?? false),
        };
      });
      return [
        {
          name: "Gullkunder",
          title: "Gullkunder – topp 50 på forbruk",
          subtitle: range.label,
          tables: [
            {
              columns: [
                { key: "rank", header: "#", type: "int", width: 6 },
                { key: "name", header: "Kunde", type: "text", width: 30 },
                { key: "visits", header: "Besøk i perioden", type: "int", total: "sum" },
                { key: "spend", header: "Forbruk inkl. mva", type: "money", total: "sum" },
                { key: "avg", header: "Snitt per besøk", type: "money2" },
                { key: "first", header: "Første besøk", type: "date" },
                { key: "last", header: "Siste besøk", type: "date" },
                { key: "fav", header: "Favorittbarber", type: "text", width: 20 },
                { key: "consent", header: "Markedsføringssamtykke", type: "text", width: 14 },
              ],
              rows,
              note:
                "Forbruk = sum kassesalg på kunden i perioden (inkl. mva). Favorittbarber = barberen med flest besøk totalt (ved likt: høyest forbruk). Kun navn vises – ingen kontaktinfo." + staffNote(staff),
            },
          ],
        },
      ];
    } catch (e) {
      return failSheet("Gullkunder", "Gullkunder", e instanceof Error ? e.message : "Ukjent feil");
    }
  },
};

const inaktive: ReportDef = {
  key: "kunder-inaktive",
  title: "Kunder – inaktive",
  description: "Kunder som har vært innom før, men ikke siste 60 / 90 / 180 dager (regnet fra periodens slutt).",
  category: "Kunder",
  async build({ range, sb }) {
    try {
      const [customers, sales, staff] = await Promise.all([
        loadCustomers(sb),
        loadSalesUpTo(sb, range.endIso),
        loadStaffNames(sb),
      ]);
      const agg = aggregate(sales, new Date(range.startIso).getTime());
      const custById = new Map(customers.map((c) => [c.id, c]));
      const end = range.to;

      type Row = { id: string; days: number; a: Agg };
      const all: Row[] = [];
      for (const [id, a] of agg) all.push({ id, days: daysBetween(a.last, end), a });
      const n = all.length;
      const over = (d: number) => all.filter((r) => r.days > d);
      const o60 = over(60);
      const o90 = over(90);
      const o180 = over(180);
      const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.a.spend, 0);

      const buckets = [
        { label: "Aktive (0–60 dager)", rs: all.filter((r) => r.days <= 60) },
        { label: "61–90 dager siden sist", rs: all.filter((r) => r.days > 60 && r.days <= 90) },
        { label: "91–180 dager siden sist", rs: all.filter((r) => r.days > 90 && r.days <= 180) },
        { label: "Over 180 dager siden sist", rs: o180 },
      ];

      const list = [...o60].sort((x, y) => y.a.spend - x.a.spend).slice(0, 200);

      return [
        {
          name: "Inaktive kunder",
          title: "Inaktive kunder",
          subtitle: `Regnet fra ${range.to} (periodens slutt)`,
          kpis: [
            { label: "Kunder med besøk totalt", value: n, type: "int", hint: "med minst ett kassesalg fram til periodens slutt" },
            { label: "Inaktive 60+ dager", value: o60.length, type: "int" },
            { label: "Inaktive 90+ dager", value: o90.length, type: "int" },
            { label: "Inaktive 180+ dager", value: o180.length, type: "int" },
            { label: "Andel inaktive 90+", value: n ? o90.length / n : null, type: "pct" },
          ],
          tables: [
            {
              title: "Fordeling etter tid siden siste besøk",
              columns: [
                { key: "label", header: "Gruppe", type: "text", width: 30 },
                { key: "count", header: "Kunder", type: "int", total: "sum" },
                { key: "share", header: "Andel", type: "pct" },
                { key: "spend", header: "Historisk forbruk inkl. mva", type: "money", total: "sum" },
              ],
              rows: buckets.map((b) => ({
                label: b.label,
                count: b.rs.length,
                share: n ? b.rs.length / n : null,
                spend: sum(b.rs),
              })),
            },
            {
              title: "Inaktive kunder (60+ dager) – topp 200 på historisk forbruk",
              columns: [
                { key: "name", header: "Kunde", type: "text", width: 30 },
                { key: "last", header: "Siste besøk", type: "date" },
                { key: "days", header: "Dager siden sist", type: "int" },
                { key: "visits", header: "Besøk totalt", type: "int", total: "sum" },
                { key: "spend", header: "Forbruk totalt inkl. mva", type: "money", total: "sum" },
                { key: "fav", header: "Favorittbarber", type: "text", width: 20 },
                { key: "consent", header: "Markedsføringssamtykke", type: "text", width: 14 },
              ],
              rows: list.map((r) => {
                const c = custById.get(r.id);
                return {
                  name: c?.name ?? "(ukjent kunde)",
                  last: r.a.last,
                  days: r.days,
                  visits: r.a.visits,
                  spend: r.a.spend,
                  fav: favourite(r.a, staff),
                  consent: yesNo(c?.consent ?? false),
                };
              }),
              note:
                "Bygger på kassesalg i det nye systemet. Kunder som bare finnes i Fixit-historikk (uten salg her) har ukjent siste besøk og er ikke med." + staffNote(staff),
            },
          ],
        },
      ];
    } catch (e) {
      return failSheet("Inaktive kunder", "Inaktive kunder", e instanceof Error ? e.message : "Ukjent feil");
    }
  },
};

const kundeklubb: ReportDef = {
  key: "kunder-kundeklubb",
  title: "Kunder – kundeklubb",
  description: "Bruk av medlemsnivåer i perioden: salg, kunder og rabatt per nivå, og bookinger per nivå.",
  category: "Kunder",
  async build({ range, sb }) {
    try {
      type SaleR = { customer_id: string | null; total_nok: number | string | null; member_tier?: string | null; member_discount_nok?: number | string | null };
      type BookR = { customer_id: string | null; status: string; member_tier?: string | null };
      const notes: string[] = [];

      let sales: SaleR[] = [];
      let tierSql = true;
      try {
        const r = await fetchFallback<SaleR>(
          [
            "id, customer_id, total_nok, member_tier, member_discount_nok",
            "id, customer_id, total_nok",
          ],
          (sel) => (f, t) =>
            sb
              .from("sales")
              .select(sel)
              .gte("sold_at", range.startIso)
              .lt("sold_at", range.endIso)
              .order("id")
              .range(f, t) as unknown as Page<SaleR>,
        );
        sales = r.rows;
        if (r.used > 0) tierSql = false;
      } catch {
        notes.push("Salg kunne ikke hentes.");
      }
      let books: BookR[] = [];
      try {
        const r = await fetchFallback<BookR>(
          ["id, customer_id, status, member_tier", "id, customer_id, status"],
          (sel) => (f, t) =>
            sb
              .from("bookings")
              .select(sel)
              .gte("start_at", range.startIso)
              .lt("start_at", range.endIso)
              .order("id")
              .range(f, t) as unknown as Page<BookR>,
        );
        books = r.rows;
        if (r.used > 0) tierSql = false;
      } catch {
        notes.push("Bookinger kunne ikke hentes.");
      }
      if (!tierSql) notes.push("Medlemsnivå på salg/bookinger mangler i databasen – kjør KJØR-I-SUPABASE-MEDLEMSFORDELER.sql.");

      const NONE = "Uten nivå";
      type T = { sales: number; custs: Set<string>; revenue: number; discount: number; books: number; bookCusts: Set<string> };
      const tiers = new Map<string, T>();
      const get = (k: string) => {
        let t = tiers.get(k);
        if (!t) tiers.set(k, (t = { sales: 0, custs: new Set(), revenue: 0, discount: 0, books: 0, bookCusts: new Set() }));
        return t;
      };
      for (const s of sales) {
        const t = get(s.member_tier?.trim() || NONE);
        t.sales++;
        t.revenue += Number(s.total_nok) || 0;
        t.discount += Number(s.member_discount_nok) || 0;
        if (s.customer_id) t.custs.add(s.customer_id);
      }
      for (const b of books) {
        if (b.status === "cancelled") continue;
        const tier = b.member_tier?.trim();
        if (!tier) continue; // bookinger uten nivå er ikke interessante her
        const t = get(tier);
        t.books++;
        if (b.customer_id) t.bookCusts.add(b.customer_id);
      }
      const memberSales = [...tiers.entries()].filter(([k]) => k !== NONE).reduce((s, [, t]) => s + t.sales, 0);
      const totalSales = [...tiers.values()].reduce((s, t) => s + t.sales, 0);
      const discount = [...tiers.values()].reduce((s, t) => s + t.discount, 0);

      const rows = [...tiers.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([k, t]) => ({
          tier: k,
          sales: t.sales,
          custs: t.custs.size,
          revenue: t.revenue,
          discount: t.discount,
          books: t.books,
          bookCusts: t.bookCusts.size,
        }));

      return [
        {
          name: "Kundeklubb",
          title: "Kundeklubb – medlemsnivåer",
          subtitle: range.label,
          kpis: [
            { label: "Salg med medlemsnivå", value: memberSales, type: "int" },
            { label: "Andel av alle kundesalg", value: totalSales ? memberSales / totalSales : null, type: "pct" },
            { label: "Medlemsrabatt gitt", value: discount, type: "money", hint: "sum member_discount_nok" },
          ],
          tables: [
            {
              title: "Per medlemsnivå",
              columns: [
                { key: "tier", header: "Nivå", type: "text", width: 18 },
                { key: "sales", header: "Salg", type: "int", total: "sum" },
                { key: "custs", header: "Unike kunder (salg)", type: "int" },
                { key: "revenue", header: "Omsetning inkl. mva", type: "money", total: "sum" },
                { key: "discount", header: "Rabatt gitt", type: "money", total: "sum" },
                { key: "books", header: "Bookinger med nivå", type: "int", total: "sum" },
                { key: "bookCusts", header: "Unike kunder (booking)", type: "int" },
              ],
              rows,
              note:
                "Nivå er det som ble lagret på selve salget/bookingen (rabatten som ble gitt), ikke kundens nivå i dag. Antall medlemmer per nivå i dag hentes ikke (RPC member_profile er per kunde-token og for tung). " +
                notes.join(" "),
            },
          ],
        },
      ];
    } catch (e) {
      return failSheet("Kundeklubb", "Kundeklubb", e instanceof Error ? e.message : "Ukjent feil");
    }
  },
};

export const REPORTS: ReportDef[] = [sammendrag, topp, inaktive, kundeklubb];
