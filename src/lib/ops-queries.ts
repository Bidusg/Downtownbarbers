import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Query-lag for admin-drift: lønn, gavekort, kasseoppgjør, fravær,
 * timelister, kampanjer og budsjett. Alt degraderer til tomt ved feil.
 * ===================================================================== */

export type StaffOption = { id: string; full_name: string; title: string | null };

export async function getStaffOptions(): Promise<StaffOption[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("id, full_name, title, active")
      .eq("active", true)
      .order("employee_number");
    return (data ?? []).map((r) => ({
      id: r.id as string,
      full_name: r.full_name as string,
      title: (r.title as string) ?? null,
    }));
  } catch {
    return [];
  }
}

/* ------------------------------- LØNN ------------------------------- */
// Modell (bekreftet med Kidus): grunnlønn + provisjon på eks-mva-omsetning.
export const PAYROLL = {
  BASE_NOK: 27000, // fast grunnlønn per barber/mnd
  THRESHOLD_NOK: 72000, // budsjett-terskel (eks. mva)
  RATE: 0.4, // andel til barber over terskel
  MVA: 0.25, // norsk standardsats – sales.total_nok antas inkl. mva
} as const;

export type PayrollRow = {
  staffId: string;
  name: string;
  title: string | null;
  grossNok: number; // omsetning inkl. mva (sum sales.total_nok)
  netNok: number; // eks. mva
  commissionBaseNok: number; // maks(0, netto − terskel)
  commissionNok: number; // provisjon (40 %)
  baseNok: number; // grunnlønn
  totalNok: number; // total lønn
};

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  return { start, end };
}

export async function getPayroll(
  year: number,
  month: number,
): Promise<PayrollRow[]> {
  try {
    const sb = await createClient();
    const staff = await getStaffOptions();
    const { start, end } = monthRange(year, month);
    const { data: sales } = await sb
      .from("sales")
      .select("staff_id, total_nok")
      .gte("sold_at", start)
      .lt("sold_at", end);

    const grossByStaff = new Map<string, number>();
    for (const s of sales ?? []) {
      if (!s.staff_id) continue;
      grossByStaff.set(
        s.staff_id as string,
        (grossByStaff.get(s.staff_id as string) ?? 0) + (Number(s.total_nok) || 0),
      );
    }

    return staff.map((st) => {
      const gross = grossByStaff.get(st.id) ?? 0;
      const net = gross / (1 + PAYROLL.MVA);
      const commissionBase = Math.max(0, net - PAYROLL.THRESHOLD_NOK);
      const commission = commissionBase * PAYROLL.RATE;
      return {
        staffId: st.id,
        name: st.full_name,
        title: st.title,
        grossNok: gross,
        netNok: net,
        commissionBaseNok: commissionBase,
        commissionNok: commission,
        baseNok: PAYROLL.BASE_NOK,
        totalNok: PAYROLL.BASE_NOK + commission,
      };
    });
  } catch {
    return [];
  }
}

/* ----------------------------- GAVEKORT ----------------------------- */
export type GiftCard = {
  id: string;
  code: string;
  initial_nok: number;
  balance_nok: number;
  created_at: string;
  expires_at: string | null;
};

export async function getGiftCards(): Promise<GiftCard[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("gift_cards")
      .select("id, code, initial_nok, balance_nok, created_at, expires_at")
      .order("created_at", { ascending: false });
    return (data as GiftCard[]) ?? [];
  } catch {
    return [];
  }
}

/* --------------------------- KASSEOPPGJØR --------------------------- */
export type CashSettlement = {
  id: string;
  settle_date: string;
  total_nok: number;
  note: string | null;
  created_at: string;
};

export async function getCashSettlements(): Promise<CashSettlement[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("cash_settlements")
      .select("id, settle_date, total_nok, note, created_at")
      .order("settle_date", { ascending: false })
      .limit(180);
    return (data as CashSettlement[]) ?? [];
  } catch {
    return [];
  }
}

/** Registrert salg (inkl. mva) for en gitt dato – referanse ved oppgjør. */
export async function getSalesTotalForDate(isoDate: string): Promise<number> {
  try {
    const sb = await createClient();
    const start = new Date(`${isoDate}T00:00:00.000Z`).toISOString();
    const end = new Date(`${isoDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const { data } = await sb
      .from("sales")
      .select("total_nok")
      .gte("sold_at", start)
      .lt("sold_at", end.toISOString());
    return (data ?? []).reduce((s, r) => s + (Number(r.total_nok) || 0), 0);
  } catch {
    return 0;
  }
}

/* ------------------------------ FRAVÆR ------------------------------ */
export type Absence = {
  id: string;
  staff_id: string;
  staffName: string;
  from_date: string;
  to_date: string;
  reason: string | null;
};

export async function getAbsences(): Promise<Absence[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("absences")
      .select("id, staff_id, from_date, to_date, reason, staff(full_name)")
      .order("from_date", { ascending: false });
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: st?.full_name ?? "—",
        from_date: r.from_date as string,
        to_date: r.to_date as string,
        reason: (r.reason as string) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/* ---------------------------- TIMELISTER ---------------------------- */
export type StaffHour = {
  id: string;
  staff_id: string;
  staffName: string;
  weekday: number; // 0 = søndag
  start_time: string;
  end_time: string;
};

export const WEEKDAYS = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];

export async function getStaffHours(): Promise<StaffHour[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff_hours")
      .select("id, staff_id, weekday, start_time, end_time, staff(full_name)")
      .order("weekday");
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: r.staff_id as string,
        staffName: st?.full_name ?? "—",
        weekday: Number(r.weekday),
        start_time: (r.start_time as string).slice(0, 5),
        end_time: (r.end_time as string).slice(0, 5),
      };
    });
  } catch {
    return [];
  }
}

/* ---------------------------- KAMPANJER ----------------------------- */
export type Campaign = {
  id: string;
  name: string;
  channel: string;
  body: string | null;
  scheduled_at: string | null;
  created_at: string;
};

export async function getCampaigns(): Promise<Campaign[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("campaigns")
      .select("id, name, channel, body, scheduled_at, created_at")
      .order("created_at", { ascending: false });
    return (data as Campaign[]) ?? [];
  } catch {
    return [];
  }
}

/* ----------------------------- BUDSJETT ----------------------------- */
export type Budget = {
  id: string;
  staff_id: string | null;
  staffName: string;
  year: number;
  month: number;
  target_nok: number;
};

export async function getBudgets(
  year: number,
  month: number,
): Promise<Budget[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("budgets")
      .select("id, staff_id, year, month, target_nok, staff(full_name)")
      .eq("year", year)
      .eq("month", month)
      .order("target_nok", { ascending: false });
    return (data ?? []).map((r) => {
      const st = r.staff as { full_name?: string } | null;
      return {
        id: r.id as string,
        staff_id: (r.staff_id as string) ?? null,
        staffName: st?.full_name ?? "—",
        year: Number(r.year),
        month: Number(r.month),
        target_nok: Number(r.target_nok) || 0,
      };
    });
  } catch {
    return [];
  }
}
