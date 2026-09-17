import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

export type MyBooking = {
  id: string;
  start_at: string;
  customer: string;
  service: string;
  status: string;
};

export type MyAgenda = {
  staffId: string | null;
  staffName: string | null;
  linked: boolean;
  bookings: MyBooking[];
};

/** Innlogget ansatts kommende timer (matchet på e-post mot staff). */
export async function getMyAgenda(): Promise<MyAgenda> {
  try {
    const me = await getUserRole();
    if (!me?.email) return { staffId: null, staffName: null, linked: false, bookings: [] };
    const sb = await createClient();

    const { data: staff } = await sb
      .from("staff")
      .select("id, full_name")
      .ilike("email", me.email)
      .maybeSingle();

    if (!staff) return { staffId: null, staffName: null, linked: false, bookings: [] };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data } = await sb
      .from("bookings")
      .select("id, start_at, status, customers(full_name), services(name)")
      .eq("staff_id", staff.id)
      .gte("start_at", startOfToday.toISOString())
      .order("start_at", { ascending: true })
      .limit(50);

    const bookings: MyBooking[] = (data ?? []).map((b) => {
      const c = b.customers as { full_name?: string } | null;
      const s = b.services as { name?: string } | null;
      return {
        id: b.id,
        start_at: b.start_at,
        customer: c?.full_name ?? "—",
        service: s?.name ?? "—",
        status: b.status,
      };
    });

    return { staffId: staff.id, staffName: staff.full_name, linked: true, bookings };
  } catch {
    return { staffId: null, staffName: null, linked: false, bookings: [] };
  }
}

/* =====================================================================
 * SELVBETJENING (/ansatt) – alt filtreres server-side til innlogget
 * ansatt via SECURITY DEFINER-RPC-ene i 0035 (current_staff_id()).
 * ===================================================================== */

export type StaffLink = {
  staffId: string | null;
  staffName: string | null;
  linked: boolean;
};

/** Lett kobling innlogget bruker -> egen staff-rad (kun id + navn). */
export async function getMyStaffLink(): Promise<StaffLink> {
  try {
    const me = await getUserRole();
    if (!me) return { staffId: null, staffName: null, linked: false };
    const sb = await createClient();
    const filters: string[] = [`profile_id.eq.${me.userId}`];
    if (me.email) filters.push(`email.ilike.${me.email}`);
    const { data } = await sb
      .from("staff")
      .select("id, full_name")
      .eq("active", true)
      .or(filters.join(","))
      .limit(1)
      .maybeSingle();
    if (!data) return { staffId: null, staffName: null, linked: false };
    return {
      staffId: data.id as string,
      staffName: (data.full_name as string) ?? null,
      linked: true,
    };
  } catch {
    return { staffId: null, staffName: null, linked: false };
  }
}

export type MyTurnusRow = {
  weekday: number; // 0 = søndag
  week_parity: number; // 0 = hver uke, 1 = uke A, 2 = uke B
  start_time: string; // HH:MM
  end_time: string; // HH:MM
};

/** Egen turnus-mal (uke A/B). Kun lesing. */
export async function getMyTurnus(): Promise<MyTurnusRow[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("my_turnus");
    return ((data as MyTurnusRow[] | null) ?? []).map((r) => ({
      weekday: Number(r.weekday),
      week_parity: Number(r.week_parity ?? 0),
      start_time: String(r.start_time).slice(0, 5),
      end_time: String(r.end_time).slice(0, 5),
    }));
  } catch {
    return [];
  }
}

export type MyUpcomingShift = {
  work_date: string; // yyyy-mm-dd
  weekday: number;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  week_parity: number;
};

/** Kommende konkrete vakter (utledet av turnus + anker, fravær trukket fra). */
export async function getMyUpcomingShifts(days = 21): Promise<MyUpcomingShift[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("my_upcoming_shifts", { p_days: days });
    return ((data as MyUpcomingShift[] | null) ?? []).map((r) => ({
      work_date: String(r.work_date),
      weekday: Number(r.weekday),
      start_time: String(r.start_time).slice(0, 5),
      end_time: String(r.end_time).slice(0, 5),
      week_parity: Number(r.week_parity ?? 0),
    }));
  } catch {
    return [];
  }
}

export type MyException = {
  id: string;
  date: string;
  kind: string; // 'off' | 'extra'
  start_time: string | null; // HH:MM
  end_time: string | null;
  note: string | null;
};

/** Egne avvik per dato (fri/ekstravakt). Kun lesing. */
export async function getMyExceptions(
  from?: string,
  to?: string,
): Promise<MyException[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("my_exceptions", {
      p_from: from ?? null,
      p_to: to ?? null,
    });
    return (
      (data as
        | {
            id: string;
            date: string;
            kind: string;
            start_time: string | null;
            end_time: string | null;
            note: string | null;
          }[]
        | null) ?? []
    ).map((r) => ({
      id: r.id,
      date: String(r.date),
      kind: r.kind,
      start_time: r.start_time ? String(r.start_time).slice(0, 5) : null,
      end_time: r.end_time ? String(r.end_time).slice(0, 5) : null,
      note: r.note,
    }));
  } catch {
    return [];
  }
}

export type MyAbsence = {
  id: string;
  from_date: string;
  to_date: string;
  reason: string | null;
};

/** Egne fravær over datointervall (ferie o.l.). Kun lesing. */
export async function getMyAbsences(
  from?: string,
  to?: string,
): Promise<MyAbsence[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("my_absences", {
      p_from: from ?? null,
      p_to: to ?? null,
    });
    return ((data as MyAbsence[] | null) ?? []).map((r) => ({
      id: r.id,
      from_date: String(r.from_date),
      to_date: String(r.to_date),
      reason: r.reason ?? null,
    }));
  } catch {
    return [];
  }
}

export type LeaveStatus = "pending" | "approved" | "declined";
export type MyLeaveRequest = {
  id: string;
  from_date: string;
  to_date: string;
  kind: string;
  note: string | null;
  status: LeaveStatus;
  created_at: string;
};

/** Egne fravaerssøknader (leser via RLS self-select – kun egne rader). */
export async function getMyLeaveRequests(): Promise<MyLeaveRequest[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("leave_requests")
      .select("id, from_date, to_date, kind, note, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data as MyLeaveRequest[] | null) ?? []).map((r) => ({
      id: r.id,
      from_date: String(r.from_date),
      to_date: String(r.to_date),
      kind: r.kind,
      note: r.note ?? null,
      status: r.status,
      created_at: String(r.created_at),
    }));
  } catch {
    return [];
  }
}

export type MyShiftDay = {
  day: string; // yyyy-mm-dd
  worked_minutes: number;
  events: number;
};

/** Egne stemplede timer summert per dag (Oslo-tid). Kun lesing. */
export async function getMyShiftDays(
  from: string,
  to: string,
): Promise<MyShiftDay[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("my_shift_days", { p_from: from, p_to: to });
    return ((data as MyShiftDay[] | null) ?? []).map((r) => ({
      day: String(r.day),
      worked_minutes: Number(r.worked_minutes ?? 0),
      events: Number(r.events ?? 0),
    }));
  } catch {
    return [];
  }
}

export type MyShiftEvent = {
  id: string;
  event_type: string; // start | pause | resume | end
  created_at: string;
  note: string | null;
};

/** Egne rå stemplingshendelser. Kun lesing. */
export async function getMyShiftEvents(
  from: string,
  to: string,
): Promise<MyShiftEvent[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("my_shift_events", {
      p_from: from,
      p_to: to,
    });
    return ((data as MyShiftEvent[] | null) ?? []).map((r) => ({
      id: r.id,
      event_type: r.event_type,
      created_at: String(r.created_at),
      note: r.note ?? null,
    }));
  } catch {
    return [];
  }
}
