import { createClient } from "@/lib/supabase/server";

/* Stemplet arbeidstid for alle ansatte (admin/eier/revisor) – fra kassa sin
 * stempelklokke. Krever KJØR-I-SUPABASE-TVERS-AV-ROLLER.sql. */

export type ShiftDay = {
  staffId: string;
  name: string;
  day: string; // yyyy-mm-dd
  minutes: number;
  events: number;
  open: boolean;
};

export async function getStaffShiftDays(
  from: string,
  to: string,
): Promise<{ rows: ShiftDay[]; missingSql: boolean }> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("staff_shift_days", { p_from: from, p_to: to });
    if (error) return { rows: [], missingSql: error.code === "PGRST202" || /staff_shift_days/.test(error.message) };
    return {
      rows: ((data ?? []) as {
        staff_id: string;
        full_name: string;
        day: string;
        worked_minutes: number;
        events: number;
        open_shift: boolean;
      }[]).map((r) => ({
        staffId: r.staff_id,
        name: r.full_name,
        day: r.day,
        minutes: Number(r.worked_minutes) || 0,
        events: Number(r.events) || 0,
        open: !!r.open_shift,
      })),
      missingSql: false,
    };
  } catch {
    return { rows: [], missingSql: false };
  }
}
