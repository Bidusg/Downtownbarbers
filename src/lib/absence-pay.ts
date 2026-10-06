import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Trekk i grunnlønn for fravær (ulønnet permisjon / ugyldig fravær).
 *   trekk = grunnlønn × fraværsdager ÷ arbeidsdager (turnusdager i
 *   måneden; uten turnus regnes man–fre). RPC absence_deduction_by_staff.
 *   Mangler RPC-en (SQL ikke kjørt) → ingen trekk, som før.
 * ===================================================================== */

export type AbsenceDays = { workdays: number; absentDays: number };

export async function getAbsenceDays(year: number, month: number): Promise<Map<string, AbsenceDays>> {
  const out = new Map<string, AbsenceDays>();
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("absence_deduction_by_staff", { p_year: year, p_month: month });
    if (error) return out;
    for (const r of (data as { staff_id: string; workdays: number; absent_days: number }[] | null) ?? []) {
      out.set(r.staff_id, { workdays: Number(r.workdays) || 0, absentDays: Number(r.absent_days) || 0 });
    }
  } catch {
    // ingen trekk
  }
  return out;
}

/** Trekk i kroner (aldri mer enn hele grunnlønnen). */
export function absenceDeduction(base: number, d: AbsenceDays | undefined): number {
  if (!d || d.absentDays <= 0 || d.workdays <= 0) return 0;
  return Math.min(base, Math.round((base * d.absentDays) / d.workdays));
}
