import { createClient } from "@/lib/supabase/server";
import {
  getStaffOptions,
  payrollIncludes,
  PAYROLL,
  type PayrollRow,
} from "@/lib/ops-queries";
import { getAbsenceDays, baseSalaryForMonth } from "@/lib/absence-pay";

/* =====================================================================
 * Lønnsberegning for revisor.
 *   Revisor har IKKE direkte lesetilgang til `sales`, så bruttosum per
 *   ansatt hentes via RPC `monthly_gross_by_staff` (SECURITY DEFINER,
 *   rollegatet admin/revisor). Selve lønns-utregningen gjenbruker samme
 *   satser og semantikk som `getPayroll` i ops-queries.ts – ingen egne
 *   satser hardkodes her.
 * ===================================================================== */

/** Status for bruttosum-RPC-en – vises i UI hvis lønn ikke kan beregnes (ellers ville alt blitt 0). */
export async function payrollGrossStatus(year: number, month: number): Promise<string | null> {
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("monthly_gross_by_staff", { p_year: year, p_month: month });
    if (!error) return null;
    if (/monthly_gross_by_staff|function|schema cache/i.test(error.message))
      return "Lønn kunne ikke beregnes: omsetnings-funksjonen mangler i databasen. Kjør KJØR-I-SUPABASE-FRAVAER-LONN.sql (og KJØR-I-SUPABASE-LONN-OSLO-TID.sql) i Supabase.";
    return `Lønn kunne ikke beregnes: ${error.message}`;
  } catch {
    return "Lønn kunne ikke beregnes.";
  }
}

/**
 * Lønn per ansatt (også de som sluttet i måneden) for gitt måned, beregnet nøyaktig som `getPayroll`
 * men med bruttosum hentet via RPC (revisor-vennlig). Degraderer til tom
 * liste ved feil, i tråd med resten av query-laget.
 *
 *   net            = gross / (1 + MVA)
 *   commissionBase = max(0, net − THRESHOLD_NOK)
 *   commission     = commissionBase * RATE
 *   base           = BASE_NOK
 *   total          = base + commission
 */
export async function getPayrollForMonth(
  year: number,
  month: number,
): Promise<PayrollRow[]> {
  try {
    const sb = await createClient();
    const staff = await getStaffOptions({ includeInactive: true });

    const { data: grossRows, error: grossErr } = await sb.rpc("monthly_gross_by_staff", {
      p_year: year,
      p_month: month,
    });
    // Feil her må ikke bli «0 kr omsetning» for alle – gi tom liste (UI viser payrollGrossStatus).
    if (grossErr) throw new Error(grossErr.message);

    const grossByStaff = new Map<string, number>();
    for (const r of (grossRows as
      | { staff_id: string; gross_nok: number }[]
      | null) ?? []) {
      if (!r.staff_id) continue;
      grossByStaff.set(r.staff_id, Number(r.gross_nok) || 0);
    }

    const absence = await getAbsenceDays(year, month);
    return staff
      .filter((st) => payrollIncludes(st, year, month, grossByStaff))
      .map((st) => {
      const gross = grossByStaff.get(st.id) ?? 0;
      const net = gross / (1 + PAYROLL.MVA);
      const commissionBase = Math.max(0, net - PAYROLL.THRESHOLD_NOK);
      const commission = commissionBase * PAYROLL.RATE;
      const base = st.base_salary_nok ?? PAYROLL.BASE_NOK;
      const bs = baseSalaryForMonth(base, year, month, st.start_date, st.end_date, absence.get(st.id));
      return {
        staffId: st.id,
        name: st.full_name,
        title: st.title,
        grossNok: gross,
        netNok: net,
        commissionBaseNok: commissionBase,
        commissionNok: commission,
        baseNok: base,
        totalNok: bs.effectiveBase + commission,
        absenceDays: absence.get(st.id)?.absentDays ?? 0,
        workdays: absence.get(st.id)?.workdays ?? 0,
        deductionNok: bs.absenceDeduction,
        employedDays: bs.employedDays,
        daysInMonth: bs.daysInMonth,
        employmentDeductionNok: bs.employmentDeduction,
      };
    });
  } catch {
    return [];
  }
}
