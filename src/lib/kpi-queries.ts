import { createClient } from "@/lib/supabase/server";
import { getStaffOptions } from "@/lib/ops-queries";
import { getRevenueBreakdown, type Range } from "@/lib/report-queries";

/* =====================================================================
 * NØKKELTALL (KPI)
 *   Omsetning/snittsalg, rebooking %, anbefaling % (kundekilde) og
 *   timeutnyttelse. Bygger på eksisterende data. Defensivt.
 *
 *   Timeutnyttelse v1: booket tid mot åpningstid (09–21, man–lør) ×
 *   antall aktive barberer. Turnus-presis (staff_hours uke A/B) er en
 *   senere oppgradering – appen har i dag ingen A/B-anker for kalenderuker.
 * ===================================================================== */

const OPEN_MIN_PER_DAY = 12 * 60; // 09–21
const WOM = /anbefal/i; // munn-til-munn-kilder

/** Antall åpningsdager (man–lør) i [from, to] inklusiv. */
function businessDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let d = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  let n = 0;
  while (d <= end) {
    const wd = new Date(d).getUTCDay(); // 0 = søndag
    if (wd !== 0) n++;
    d += 86400000;
  }
  return n;
}

export type KpiOverview = {
  revenue: number;
  avgSale: number;
  saleCount: number;
  rebooking: { pct: number; rebooked: number; visitCustomers: number };
  referral: {
    pct: number; // andel munn-til-munn av de som oppga kilde
    wom: number;
    withSource: number;
    newCustomers: number;
    breakdown: { label: string; count: number }[];
  };
  utilization: {
    salonPct: number;
    bookedHours: number;
    capacityHours: number;
    businessDays: number;
    activeBarbers: number;
    perBarber: { name: string; pct: number; hours: number }[];
  };
};

export async function getKpiOverview(r: Range): Promise<KpiOverview> {
  const bd = businessDays(r.from, r.to);
  const empty: KpiOverview = {
    revenue: 0, avgSale: 0, saleCount: 0,
    rebooking: { pct: 0, rebooked: 0, visitCustomers: 0 },
    referral: { pct: 0, wom: 0, withSource: 0, newCustomers: 0, breakdown: [] },
    utilization: {
      salonPct: 0, bookedHours: 0, capacityHours: 0,
      businessDays: bd, activeBarbers: 0, perBarber: [],
    },
  };
  try {
    const sb = await createClient();
    const [breakdown, staff, bookingsFwd, bookingsRange, newCustomers] = await Promise.all([
      getRevenueBreakdown(r),
      getStaffOptions(),
      // Alle ikke-avlyste bookinger fra periodestart og framover (til rebooking).
      sb.from("bookings")
        .select("customer_id, start_at, status")
        .gte("start_at", r.startIso)
        .neq("status", "cancelled")
        .not("customer_id", "is", null)
        .limit(100000),
      // Bookinger i perioden med varighet (til timeutnyttelse).
      sb.from("bookings")
        .select("staff_id, start_at, end_at, status, service_id")
        .gte("start_at", r.startIso)
        .lt("start_at", r.endIso)
        .limit(100000),
      // Nye kunder i perioden (created_at ≈ første berøring) + kilde.
      sb.from("customers")
        .select("source, created_at")
        .gte("created_at", r.startIso)
        .lt("created_at", r.endIso)
        .limit(100000),
    ]);

    /* ----- Rebooking ----- */
    const lastCompletedInRange = new Map<string, string>();
    const allByCustomer = new Map<string, string[]>();
    for (const b of bookingsFwd.data ?? []) {
      const cid = b.customer_id as string;
      const arr = allByCustomer.get(cid) ?? [];
      arr.push(b.start_at as string);
      allByCustomer.set(cid, arr);
      if (b.status === "completed" && (b.start_at as string) < r.endIso) {
        const cur = lastCompletedInRange.get(cid);
        if (!cur || (b.start_at as string) > cur) lastCompletedInRange.set(cid, b.start_at as string);
      }
    }
    let rebooked = 0;
    for (const [cid, ref] of lastCompletedInRange) {
      const later = (allByCustomer.get(cid) ?? []).some((t) => t > ref);
      if (later) rebooked++;
    }
    const visitCustomers = lastCompletedInRange.size;

    /* ----- Timeutnyttelse ----- */
    const bookedMinByStaff = new Map<string, number>();
    let bookedMinTotal = 0;
    for (const b of bookingsRange.data ?? []) {
      if (!b.service_id) continue; // hopp over blokkeringer/pauser
      if (!(b.status === "completed" || b.status === "confirmed")) continue;
      const mins = (new Date(b.end_at as string).getTime() - new Date(b.start_at as string).getTime()) / 60000;
      if (!(mins > 0)) continue;
      bookedMinTotal += mins;
      if (b.staff_id) bookedMinByStaff.set(b.staff_id as string, (bookedMinByStaff.get(b.staff_id as string) ?? 0) + mins);
    }
    const activeBarbers = staff.length;
    const capacityMinPerBarber = bd * OPEN_MIN_PER_DAY;
    const capacityMinTotal = capacityMinPerBarber * activeBarbers;
    const perBarber = staff
      .map((st) => {
        const mins = bookedMinByStaff.get(st.id) ?? 0;
        return {
          name: st.full_name,
          hours: Math.round((mins / 60) * 10) / 10,
          pct: capacityMinPerBarber > 0 ? Math.round((mins / capacityMinPerBarber) * 100) : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct);

    /* ----- Anbefaling (kundekilde) ----- */
    const rows = newCustomers.data ?? [];
    const srcCount = new Map<string, number>();
    let withSource = 0, wom = 0;
    for (const c of rows) {
      const s = ((c.source as string) ?? "").trim();
      if (!s) continue;
      withSource++;
      if (WOM.test(s)) wom++;
      srcCount.set(s, (srcCount.get(s) ?? 0) + 1);
    }

    return {
      revenue: breakdown.total,
      avgSale: breakdown.avg,
      saleCount: breakdown.saleCount,
      rebooking: {
        pct: visitCustomers > 0 ? Math.round((rebooked / visitCustomers) * 100) : 0,
        rebooked,
        visitCustomers,
      },
      referral: {
        pct: withSource > 0 ? Math.round((wom / withSource) * 100) : 0,
        wom,
        withSource,
        newCustomers: rows.length,
        breakdown: Array.from(srcCount, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      },
      utilization: {
        salonPct: capacityMinTotal > 0 ? Math.round((bookedMinTotal / capacityMinTotal) * 100) : 0,
        bookedHours: Math.round((bookedMinTotal / 60) * 10) / 10,
        capacityHours: Math.round(capacityMinTotal / 60),
        businessDays: bd,
        activeBarbers,
        perBarber,
      },
    };
  } catch {
    return empty;
  }
}
