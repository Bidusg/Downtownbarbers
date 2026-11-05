import { createClient } from "@/lib/supabase/server";
import { getPayrollForMonth } from "@/lib/payroll-slips";
import { getStaffOptions, PAYROLL } from "@/lib/ops-queries";
import {
  getSalarySettings,
  getSalaryPeriod,
  getSalaryManualLines,
  getPlannedHours,
} from "@/lib/salary/queries";
import { computeSalary } from "@/lib/salary/compute";
import type {
  SalarySettings,
  SalaryPeriodInputs,
  SalaryContext,
  SalaryResult,
} from "@/lib/salary/types";

/* =====================================================================
 * Samlet lønnsrapport: samme beregning som lønnssiden per ansatt
 * (computeSalary), for flere ansatte i én måned. Tunge oppslag (omsetning,
 * fravær, turnus-timer, tjeneste/vare-split) gjøres ÉN gang for alle.
 * ===================================================================== */

export type SalaryReportEntry = {
  staffId: string;
  name: string;
  title: string | null;
  settings: SalarySettings;
  period: SalaryPeriodInputs;
  context: SalaryContext;
  result: SalaryResult;
};

/** Ansatte som kan velges i lønnsrapporten for måneden (aktive + de som
 *  hadde lønn/omsetning i måneden). */
export async function getSalaryReportStaff(
  year: number,
  month: number,
): Promise<{ id: string; name: string; title: string | null }[]> {
  const [rows, active] = await Promise.all([getPayrollForMonth(year, month), getStaffOptions()]);
  const map = new Map<string, { id: string; name: string; title: string | null }>();
  for (const r of rows) map.set(r.staffId, { id: r.staffId, name: r.name, title: r.title });
  for (const s of active) if (!map.has(s.id)) map.set(s.id, { id: s.id, name: s.full_name, title: s.title });
  return [...map.values()];
}

async function revenueSplitAll(
  year: number,
  month: number,
): Promise<{ map: Map<string, { service: number; product: number }>; available: boolean }> {
  const map = new Map<string, { service: number; product: number }>();
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("monthly_revenue_split_by_staff", {
      p_year: year,
      p_month: month,
    });
    if (error || !data) return { map, available: false };
    for (const r of data as { staff_id: string; service_nok: number; product_nok: number }[]) {
      map.set(r.staff_id, { service: Number(r.service_nok) || 0, product: Number(r.product_nok) || 0 });
    }
    return { map, available: true };
  } catch {
    return { map, available: false };
  }
}

/**
 * Lønnsrapport for valgte ansatte (`ids`), eller alle valgbare når `ids`
 * er tom/null. Rekkefølgen følger ansattlisten.
 */
export async function getSalaryReports(
  year: number,
  month: number,
  ids: string[] | null,
): Promise<SalaryReportEntry[]> {
  const [rows, staffAll, split, planned, selectable] = await Promise.all([
    getPayrollForMonth(year, month),
    getStaffOptions({ includeInactive: true }),
    revenueSplitAll(year, month),
    getPlannedHours(year, month),
    getSalaryReportStaff(year, month),
  ]);
  const wanted = ids && ids.length ? new Set(ids) : null;
  const pick = selectable.filter((s) => !wanted || wanted.has(s.id));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Promise.all(
    pick.map(async (st) => {
      const [settings, period, manual] = await Promise.all([
        getSalarySettings(st.id),
        getSalaryPeriod(st.id, year, month),
        getSalaryManualLines(st.id, year, month),
      ]);
      const row = rows.find((r) => r.staffId === st.id);
      const opt = staffAll.find((s) => s.id === st.id);
      const sp = split.map.get(st.id);
      const context: SalaryContext = {
        staffBaseSalaryNok: row?.baseNok ?? opt?.base_salary_nok ?? PAYROLL.BASE_NOK,
        employedDays: row?.employedDays ?? daysInMonth,
        daysInMonth: row?.daysInMonth ?? daysInMonth,
        absenceDays: row?.absenceDays ?? 0,
        workdays: row?.workdays ?? 0,
        grossInclVatNok: row?.grossNok ?? 0,
        serviceInclVatNok: sp?.service ?? 0,
        productInclVatNok: sp?.product ?? 0,
        splitAvailable: split.available,
        mva: PAYROLL.MVA,
        plannedHours: planned.get(st.id) ?? 0,
      };
      return {
        staffId: st.id,
        name: st.name,
        title: st.title,
        settings,
        period,
        context,
        result: computeSalary(settings, period, manual, context),
      };
    }),
  );
}
