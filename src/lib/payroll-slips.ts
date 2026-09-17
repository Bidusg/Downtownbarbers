import { createClient } from "@/lib/supabase/server";
import {
  getStaffOptions,
  PAYROLL,
  type PayrollRow,
} from "@/lib/ops-queries";

/* =====================================================================
 * Lønnsberegning for revisor.
 *   Revisor har IKKE direkte lesetilgang til `sales`, så bruttosum per
 *   ansatt hentes via RPC `monthly_gross_by_staff` (SECURITY DEFINER,
 *   rollegatet admin/revisor). Selve lønns-utregningen gjenbruker samme
 *   satser og semantikk som `getPayroll` i ops-queries.ts – ingen egne
 *   satser hardkodes her.
 * ===================================================================== */

/**
 * Lønn per aktiv ansatt for gitt måned, beregnet nøyaktig som `getPayroll`
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
    const staff = await getStaffOptions();

    const { data: grossRows } = await sb.rpc("monthly_gross_by_staff", {
      p_year: year,
      p_month: month,
    });

    const grossByStaff = new Map<string, number>();
    for (const r of (grossRows as
      | { staff_id: string; gross_nok: number }[]
      | null) ?? []) {
      if (!r.staff_id) continue;
      grossByStaff.set(r.staff_id, Number(r.gross_nok) || 0);
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
