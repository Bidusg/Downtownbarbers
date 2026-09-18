import { createClient } from "@/lib/supabase/server";
import { getStaffOptions } from "@/lib/ops-queries";
import type { Range } from "@/lib/report-queries";

/* =====================================================================
 * RAPPORT-MOTOR TIER 2
 *   Per-barber-produktivitet (scorecard), no-show-oversikt og
 *   turnus-presis timeutnyttelse. Bygger på eksisterende data + RPC
 *   turnus_capacity_minutes (0042). Alt degraderer til tomt ved feil.
 *   Tidsavgrensning i Europe/Oslo via Range (startIso/endIso).
 * ===================================================================== */

const round1 = (n: number) => Math.round(n * 10) / 10;

type BookingRow = {
  staff_id: string | null;
  customer_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  service_id: string | null;
};

/* ------------------------- Per barber scorecard ------------------------- */

export type BarberScore = {
  staffId: string;
  name: string;
  title: string | null;
  revenue: number;
  saleCount: number;
  avgSale: number;
  completed: number; // fullførte bookinger i perioden
  noShow: number; // ikke-møtt i perioden
  noShowPct: number; // no_show / (completed + no_show)
  rebookedPct: number; // andel gjenbookede av kunder med fullført besøk hos denne
  bookedHours: number; // fullført + bekreftet tid
  capacityHours: number; // turnus-planlagt tid
  utilizationPct: number; // bookedHours / capacityHours
};

export type BarberScoreReport = {
  rows: BarberScore[];
  salon: {
    revenue: number;
    completed: number;
    noShow: number;
    noShowPct: number;
    bookedHours: number;
    capacityHours: number;
    utilizationPct: number;
  };
};

export async function getBarberScores(r: Range): Promise<BarberScoreReport> {
  const empty: BarberScoreReport = {
    rows: [],
    salon: {
      revenue: 0, completed: 0, noShow: 0, noShowPct: 0,
      bookedHours: 0, capacityHours: 0, utilizationPct: 0,
    },
  };
  try {
    const sb = await createClient();
    const staff = await getStaffOptions();

    const [salesRes, bookingsRangeRes, bookingsFwdRes, capacityRes] =
      await Promise.all([
        // Omsetning per barber i perioden (inkl. mva).
        sb.from("sales")
          .select("staff_id, total_nok")
          .gte("sold_at", r.startIso)
          .lt("sold_at", r.endIso)
          .limit(100000),
        // Bookinger som STARTER i perioden (fullført/no-show/bekreftet).
        sb.from("bookings")
          .select("staff_id, customer_id, start_at, end_at, status, service_id")
          .gte("start_at", r.startIso)
          .lt("start_at", r.endIso)
          .limit(100000),
        // Alle ikke-avlyste bookinger fra periodestart og framover (rebooking).
        sb.from("bookings")
          .select("staff_id, customer_id, start_at, status")
          .gte("start_at", r.startIso)
          .neq("status", "cancelled")
          .not("customer_id", "is", null)
          .limit(100000),
        // Turnus-presis kapasitet (minutter per staff) via RPC (0042).
        sb.rpc("turnus_capacity_minutes", { p_from: r.from, p_to: r.to }),
      ]);

    // Omsetning + salgsantall per staff.
    const revByStaff = new Map<string, number>();
    const saleCountByStaff = new Map<string, number>();
    for (const s of (salesRes.data ?? []) as { staff_id: string | null; total_nok: number }[]) {
      if (!s.staff_id) continue;
      revByStaff.set(s.staff_id, (revByStaff.get(s.staff_id) ?? 0) + (Number(s.total_nok) || 0));
      saleCountByStaff.set(s.staff_id, (saleCountByStaff.get(s.staff_id) ?? 0) + 1);
    }

    // Bookinger i perioden: fullført/no-show-telling + booket tid per staff.
    const completedByStaff = new Map<string, number>();
    const noShowByStaff = new Map<string, number>();
    const bookedMinByStaff = new Map<string, number>();
    for (const b of (bookingsRangeRes.data ?? []) as BookingRow[]) {
      if (!b.staff_id) continue;
      if (!b.service_id) continue; // hopp over blokkeringer/pauser
      if (b.status === "completed") {
        completedByStaff.set(b.staff_id, (completedByStaff.get(b.staff_id) ?? 0) + 1);
      } else if (b.status === "no_show") {
        noShowByStaff.set(b.staff_id, (noShowByStaff.get(b.staff_id) ?? 0) + 1);
      }
      if (b.status === "completed" || b.status === "confirmed") {
        const mins = (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000;
        if (mins > 0) bookedMinByStaff.set(b.staff_id, (bookedMinByStaff.get(b.staff_id) ?? 0) + mins);
      }
    }

    // Kapasitet (minutter) per staff.
    const capMinByStaff = new Map<string, number>();
    for (const c of (capacityRes.data ?? []) as { staff_id: string; minutes: number }[]) {
      capMinByStaff.set(c.staff_id, Number(c.minutes) || 0);
    }

    // Rebooking per barber: kunder med siste fullførte besøk (hos denne
    // barbereren, i perioden) som har en senere booking (hos hvem som helst).
    const fwd = (bookingsFwdRes.data ?? []) as BookingRow[];
    const laterByCustomer = new Map<string, string[]>();
    for (const b of fwd) {
      const cid = b.customer_id as string;
      const arr = laterByCustomer.get(cid) ?? [];
      arr.push(b.start_at);
      laterByCustomer.set(cid, arr);
    }
    // Siste fullførte-i-perioden per (staff, customer).
    const lastCompletedByStaffCust = new Map<string, Map<string, string>>();
    for (const b of fwd) {
      if (b.status !== "completed") continue;
      if (!b.staff_id || !b.customer_id) continue;
      if (b.start_at >= r.endIso) continue;
      const m = lastCompletedByStaffCust.get(b.staff_id) ?? new Map<string, string>();
      const cur = m.get(b.customer_id);
      if (!cur || b.start_at > cur) m.set(b.customer_id, b.start_at);
      lastCompletedByStaffCust.set(b.staff_id, m);
    }

    const rows: BarberScore[] = staff.map((st) => {
      const revenue = Math.round(revByStaff.get(st.id) ?? 0);
      const saleCount = saleCountByStaff.get(st.id) ?? 0;
      const completed = completedByStaff.get(st.id) ?? 0;
      const noShow = noShowByStaff.get(st.id) ?? 0;
      const attendable = completed + noShow;
      const bookedMin = bookedMinByStaff.get(st.id) ?? 0;
      const capMin = capMinByStaff.get(st.id) ?? 0;

      const cust = lastCompletedByStaffCust.get(st.id);
      let visitCustomers = 0;
      let rebooked = 0;
      if (cust) {
        for (const [cid, ref] of cust) {
          visitCustomers++;
          if ((laterByCustomer.get(cid) ?? []).some((t) => t > ref)) rebooked++;
        }
      }

      return {
        staffId: st.id,
        name: st.full_name,
        title: st.title,
        revenue,
        saleCount,
        avgSale: saleCount ? Math.round(revenue / saleCount) : 0,
        completed,
        noShow,
        noShowPct: attendable ? Math.round((noShow / attendable) * 100) : 0,
        rebookedPct: visitCustomers ? Math.round((rebooked / visitCustomers) * 100) : 0,
        bookedHours: round1(bookedMin / 60),
        capacityHours: round1(capMin / 60),
        utilizationPct: capMin > 0 ? Math.round((bookedMin / capMin) * 100) : 0,
      };
    });

    rows.sort((a, b) => b.revenue - a.revenue);

    const salonRev = rows.reduce((a, x) => a + x.revenue, 0);
    const salonCompleted = rows.reduce((a, x) => a + x.completed, 0);
    const salonNoShow = rows.reduce((a, x) => a + x.noShow, 0);
    const salonBookedMin = Array.from(bookedMinByStaff.values()).reduce((a, x) => a + x, 0);
    const salonCapMin = Array.from(capMinByStaff.values()).reduce((a, x) => a + x, 0);
    const salonAttendable = salonCompleted + salonNoShow;

    return {
      rows,
      salon: {
        revenue: salonRev,
        completed: salonCompleted,
        noShow: salonNoShow,
        noShowPct: salonAttendable ? Math.round((salonNoShow / salonAttendable) * 100) : 0,
        bookedHours: round1(salonBookedMin / 60),
        capacityHours: round1(salonCapMin / 60),
        utilizationPct: salonCapMin > 0 ? Math.round((salonBookedMin / salonCapMin) * 100) : 0,
      },
    };
  } catch {
    return empty;
  }
}

/* --------------------------- No-show-oversikt --------------------------- */

export type NoShowOverview = {
  total: number;
  attendable: number; // fullført + no-show
  ratePct: number;
  perBarber: { name: string; count: number; pct: number }[];
  repeatCustomers: { name: string; count: number }[];
};

export async function getNoShowOverview(r: Range): Promise<NoShowOverview> {
  const empty: NoShowOverview = {
    total: 0, attendable: 0, ratePct: 0, perBarber: [], repeatCustomers: [],
  };
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("bookings")
      .select("status, start_at, staff(full_name), customers(full_name)")
      .gte("start_at", r.startIso)
      .lt("start_at", r.endIso)
      .in("status", ["completed", "no_show"])
      .not("service_id", "is", null)
      .limit(100000);

    const rows = (data ?? []) as {
      status: string;
      staff: { full_name?: string } | null;
      customers: { full_name?: string } | null;
    }[];

    const perBarberCount = new Map<string, { noShow: number; attendable: number }>();
    const repeat = new Map<string, number>();
    let total = 0;
    let attendable = 0;
    for (const b of rows) {
      const barber = b.staff?.full_name ?? "Ukjent";
      const cur = perBarberCount.get(barber) ?? { noShow: 0, attendable: 0 };
      cur.attendable++;
      attendable++;
      if (b.status === "no_show") {
        cur.noShow++;
        total++;
        const cust = (b.customers?.full_name ?? "").trim();
        if (cust) repeat.set(cust, (repeat.get(cust) ?? 0) + 1);
      }
      perBarberCount.set(barber, cur);
    }

    return {
      total,
      attendable,
      ratePct: attendable ? Math.round((total / attendable) * 100) : 0,
      perBarber: Array.from(perBarberCount, ([name, v]) => ({
        name,
        count: v.noShow,
        pct: v.attendable ? Math.round((v.noShow / v.attendable) * 100) : 0,
      })).sort((a, b) => b.count - a.count),
      repeatCustomers: Array.from(repeat, ([name, count]) => ({ name, count }))
        .filter((c) => c.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
    };
  } catch {
    return empty;
  }
}
