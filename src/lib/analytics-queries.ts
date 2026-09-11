import { createClient } from "@/lib/supabase/server";
import { getBudgets, getStaffOptions } from "@/lib/ops-queries";
import type { Range } from "@/lib/report-queries";

/* =====================================================================
 * ANALYSE: måloppnåelse, gjenbesøk og gullkunder.
 *   Bygger på eksisterende tabeller (sales, bookings, budgets, customers,
 *   daily_targets). Defensivt: tomt resultat ved feil.
 * ===================================================================== */

/* ---------- 1) Måloppnåelse (resultat vs budsjett) ---------- */

export type GoalRow = {
  staffId: string | null;
  name: string;
  target: number; // budsjett (kr)
  actual: number; // omsetning inkl. mva (kr)
  pct: number; // 0–100+ (kappes visuelt)
};

export type GoalProgress = {
  year: number;
  month: number;
  rows: GoalRow[];
  salonTarget: number;
  salonActual: number;
  salonPct: number;
  customerTarget: number; // sum daily_targets (customer_count) i måneden
  customerActual: number; // fullførte bookinger i måneden
};

export async function getGoalProgress(year: number, month: number): Promise<GoalProgress> {
  const empty: GoalProgress = {
    year, month, rows: [], salonTarget: 0, salonActual: 0, salonPct: 0,
    customerTarget: 0, customerActual: 0,
  };
  try {
    const sb = await createClient();
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const end = new Date(Date.UTC(year, month, 1)).toISOString();

    const [budgets, staff, salesRes, bookingRes, targetRes] = await Promise.all([
      getBudgets(year, month),
      getStaffOptions(),
      sb.from("sales").select("staff_id, total_nok").gte("sold_at", start).lt("sold_at", end),
      sb.from("bookings").select("id, status, start_at").gte("start_at", start).lt("start_at", end),
      sb.from("daily_targets").select("target_value, metric, target_date").gte("target_date", start.slice(0, 10)).lt("target_date", end.slice(0, 10)),
    ]);

    // Faktisk omsetning per barber (inkl. mva).
    const actualByStaff = new Map<string, number>();
    let salonActual = 0;
    for (const s of salesRes.data ?? []) {
      const amt = Number(s.total_nok) || 0;
      salonActual += amt;
      if (s.staff_id) actualByStaff.set(s.staff_id as string, (actualByStaff.get(s.staff_id as string) ?? 0) + amt);
    }

    // Budsjett per barber + evt. salong-mål (staff_id = null).
    const targetByStaff = new Map<string, number>();
    let salonTargetExplicit = 0;
    for (const b of budgets) {
      if (b.staff_id) targetByStaff.set(b.staff_id, b.target_nok);
      else salonTargetExplicit += b.target_nok;
    }

    const rows: GoalRow[] = staff.map((st) => {
      const target = targetByStaff.get(st.id) ?? 0;
      const actual = Math.round(actualByStaff.get(st.id) ?? 0);
      return {
        staffId: st.id,
        name: st.full_name,
        target,
        actual,
        pct: target > 0 ? Math.round((actual / target) * 100) : 0,
      };
    }).sort((a, b) => b.actual - a.actual);

    // Salong-mål: eksplisitt salong-budsjett hvis satt, ellers sum av barber-mål.
    const perStaffTargetSum = rows.reduce((a, r) => a + r.target, 0);
    const salonTarget = salonTargetExplicit > 0 ? salonTargetExplicit : perStaffTargetSum;

    const customerActual = (bookingRes.data ?? []).filter((b) => b.status === "completed").length;
    const customerTarget = (targetRes.data ?? [])
      .filter((t) => (t.metric ?? "customer_count") === "customer_count")
      .reduce((a, t) => a + (Number(t.target_value) || 0), 0);

    return {
      year, month, rows,
      salonTarget: Math.round(salonTarget),
      salonActual: Math.round(salonActual),
      salonPct: salonTarget > 0 ? Math.round((salonActual / salonTarget) * 100) : 0,
      customerTarget: Math.round(customerTarget),
      customerActual,
    };
  } catch {
    return empty;
  }
}

/* ---------- 2) Gjenbesøk (revisit / lojalitet) ---------- */

export type RevisitStats = {
  inRange: number; // kunder med minst ett fullført besøk i perioden
  returning: number; // hadde også et besøk før perioden
  newCustomers: number; // første besøk noensinne falt i perioden
  returnRatePct: number; // returning / inRange
  avgVisitsLifetime: number; // snitt fullførte besøk per kunde (livstid)
  avgDaysBetween: number; // snitt dager mellom besøk (kunder med ≥2)
  distribution: { label: string; count: number }[]; // 1, 2, 3, 4+ besøk (livstid)
};

export async function getRevisitStats(r: Range): Promise<RevisitStats> {
  const empty: RevisitStats = {
    inRange: 0, returning: 0, newCustomers: 0, returnRatePct: 0,
    avgVisitsLifetime: 0, avgDaysBetween: 0,
    distribution: [
      { label: "1 besøk", count: 0 },
      { label: "2 besøk", count: 0 },
      { label: "3 besøk", count: 0 },
      { label: "4+ besøk", count: 0 },
    ],
  };
  try {
    const sb = await createClient();
    // Alle fullførte besøk fram til periodeslutt (trenger historikk før perioden).
    const { data } = await sb
      .from("bookings")
      .select("customer_id, start_at")
      .eq("status", "completed")
      .lt("start_at", r.endIso)
      .not("customer_id", "is", null)
      .order("start_at", { ascending: true })
      .limit(100000);

    const byCustomer = new Map<string, string[]>();
    for (const b of data ?? []) {
      const cid = b.customer_id as string;
      const arr = byCustomer.get(cid) ?? [];
      arr.push(b.start_at as string);
      byCustomer.set(cid, arr);
    }

    let inRange = 0, returning = 0, newCustomers = 0;
    let visitSum = 0, custWithVisits = 0;
    let intervalSum = 0, custWith2 = 0;
    const dist = [0, 0, 0, 0]; // 1,2,3,4+

    for (const visits of byCustomer.values()) {
      const n = visits.length;
      if (n === 0) continue;
      custWithVisits++;
      visitSum += n;
      dist[Math.min(n, 4) - 1]++;
      if (n >= 2) {
        const first = new Date(visits[0]).getTime();
        const last = new Date(visits[n - 1]).getTime();
        intervalSum += (last - first) / 86400000 / (n - 1);
        custWith2++;
      }
      const inPeriod = visits.some((v) => v >= r.startIso && v < r.endIso);
      if (inPeriod) {
        inRange++;
        const firstEver = visits[0];
        if (firstEver >= r.startIso) newCustomers++;
        else returning++;
      }
    }

    return {
      inRange,
      returning,
      newCustomers,
      returnRatePct: inRange > 0 ? Math.round((returning / inRange) * 100) : 0,
      avgVisitsLifetime: custWithVisits > 0 ? Math.round((visitSum / custWithVisits) * 10) / 10 : 0,
      avgDaysBetween: custWith2 > 0 ? Math.round(intervalSum / custWith2) : 0,
      distribution: [
        { label: "1 besøk", count: dist[0] },
        { label: "2 besøk", count: dist[1] },
        { label: "3 besøk", count: dist[2] },
        { label: "4+ besøk", count: dist[3] },
      ],
    };
  } catch {
    return empty;
  }
}

/* ---------- 3) Gullkunder (topp kunder) ---------- */

export type TopCustomer = {
  name: string;
  spend: number; // omsetning i perioden (inkl. mva)
  visits: number; // antall salg i perioden
};

export async function getTopCustomers(r: Range, limit = 20): Promise<TopCustomer[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("sales")
      .select("total_nok, customer_id, customers(full_name)")
      .gte("sold_at", r.startIso)
      .lt("sold_at", r.endIso)
      .not("customer_id", "is", null)
      .limit(100000);

    const agg = new Map<string, { name: string; spend: number; visits: number }>();
    for (const s of data ?? []) {
      const cid = s.customer_id as string;
      const name = (s.customers as { full_name?: string } | null)?.full_name ?? "—";
      const cur = agg.get(cid) ?? { name, spend: 0, visits: 0 };
      cur.spend += Number(s.total_nok) || 0;
      cur.visits += 1;
      agg.set(cid, cur);
    }
    return Array.from(agg.values())
      .map((c) => ({ name: c.name, spend: Math.round(c.spend), visits: c.visits }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, limit);
  } catch {
    return [];
  }
}
