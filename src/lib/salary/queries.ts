import { createClient } from "@/lib/supabase/server";
import { getPayrollForMonth } from "@/lib/payroll-slips";
import { getStaffOptions, PAYROLL } from "@/lib/ops-queries";
import {
  DEFAULT_SALARY_SETTINGS,
  DEFAULT_SALARY_PERIOD,
} from "@/lib/salary/defaults";
import type {
  SalarySettings,
  SalaryPeriodInputs,
  SalaryManualLine,
  SalaryContext,
} from "@/lib/salary/types";

/* =====================================================================
 * Server-side oppslag for lønnssiden per ansatt. Alt degraderer trygt
 * til defaults/tomt hvis SQL ikke er kjørt ennå, så bygg og runtime
 * ikke krasjer. Kun admin/eier/revisor-rutene når hit (RLS + requireRole).
 * ===================================================================== */

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Lønnsinnstillinger for én ansatt. Mangler rad/tabell → defaults. */
export async function getSalarySettings(staffId: string): Promise<SalarySettings> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("salary_settings")
      .select("*")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_SALARY_SETTINGS };
    return {
      baseSalaryOverrideNok:
        data.base_salary_override_nok == null ? null : Number(data.base_salary_override_nok),
      commissionModel: data.commission_model === "split" ? "split" : "terskel",
      commissionRate: Number(data.commission_rate ?? DEFAULT_SALARY_SETTINGS.commissionRate),
      commissionThresholdNok: Number(
        data.commission_threshold_nok ?? DEFAULT_SALARY_SETTINGS.commissionThresholdNok,
      ),
      commissionExVat: data.commission_ex_vat ?? DEFAULT_SALARY_SETTINGS.commissionExVat,
      serviceRate: Number(data.service_rate ?? DEFAULT_SALARY_SETTINGS.serviceRate),
      productRate: Number(data.product_rate ?? DEFAULT_SALARY_SETTINGS.productRate),
      marketplaceRate: Number(data.marketplace_rate ?? DEFAULT_SALARY_SETTINGS.marketplaceRate),
      enableMarketplace: data.enable_marketplace ?? false,
      enableEvening: data.enable_evening ?? false,
      eveningFrom: (data.evening_from ?? DEFAULT_SALARY_SETTINGS.eveningFrom).slice(0, 5),
      eveningRateNok: Number(data.evening_rate_nok ?? DEFAULT_SALARY_SETTINGS.eveningRateNok),
      enableSaturday: data.enable_saturday ?? false,
      saturdayFrom: (data.saturday_from ?? DEFAULT_SALARY_SETTINGS.saturdayFrom).slice(0, 5),
      saturdayRateNok: Number(data.saturday_rate_nok ?? DEFAULT_SALARY_SETTINGS.saturdayRateNok),
      enableSunday: data.enable_sunday ?? false,
      sundayRateNok: Number(data.sunday_rate_nok ?? DEFAULT_SALARY_SETTINGS.sundayRateNok),
      enableVacationPay: data.enable_vacation_pay ?? false,
      vacationPayRate: Number(data.vacation_pay_rate ?? DEFAULT_SALARY_SETTINGS.vacationPayRate),
      enableHolidayBonus: data.enable_holiday_bonus ?? false,
      holidayBonusNok: Number(data.holiday_bonus_nok ?? 0),
      enableSickPay: data.enable_sick_pay ?? false,
      sickRateNok: Number(data.sick_rate_nok ?? 0),
    };
  } catch {
    return { ...DEFAULT_SALARY_SETTINGS };
  }
}

/** Periode-timer for én ansatt/måned. Mangler rad/tabell → nuller. */
export async function getSalaryPeriod(
  staffId: string,
  year: number,
  month: number,
): Promise<SalaryPeriodInputs> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("salary_period")
      .select("*")
      .eq("staff_id", staffId)
      .eq("period", periodKey(year, month))
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_SALARY_PERIOD };
    return {
      eveningHours: Number(data.evening_hours ?? 0),
      saturdayHours: Number(data.saturday_hours ?? 0),
      sundayHours: Number(data.sunday_hours ?? 0),
      sickHours: Number(data.sick_hours ?? 0),
      vacationHours: Number(data.vacation_hours ?? 0),
      note: data.note ?? "",
    };
  } catch {
    return { ...DEFAULT_SALARY_PERIOD };
  }
}

/** Manuelle trekk/tillegg for én ansatt/måned. */
export async function getSalaryManualLines(
  staffId: string,
  year: number,
  month: number,
): Promise<SalaryManualLine[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("salary_period_lines")
      .select("id, label, amount_nok, sort")
      .eq("staff_id", staffId)
      .eq("period", periodKey(year, month))
      .order("sort")
      .order("created_at");
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id as string,
      label: (r.label as string) ?? "",
      amountNok: Number(r.amount_nok) || 0,
      sort: Number(r.sort) || 0,
    }));
  } catch {
    return [];
  }
}

/** Tjeneste-/varesalg (inkl. mva) per ansatt via sikret RPC. */
async function getRevenueSplit(
  staffId: string,
  year: number,
  month: number,
): Promise<{ service: number; product: number; available: boolean }> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("monthly_revenue_split_by_staff", {
      p_year: year,
      p_month: month,
    });
    if (error || !data) return { service: 0, product: 0, available: false };
    const row = (data as { staff_id: string; service_nok: number; product_nok: number }[]).find(
      (r) => r.staff_id === staffId,
    );
    return {
      service: Number(row?.service_nok ?? 0),
      product: Number(row?.product_nok ?? 0),
      available: true,
    };
  } catch {
    return { service: 0, product: 0, available: false };
  }
}

/**
 * Bygger SalaryContext for én ansatt/måned ved å GJENBRUKE de reelle
 * lønnstallene fra getPayrollForMonth (omsetning, grunnlønn, ansettelse,
 * fravær) + tjeneste/vare-split. Returnerer null hvis ansatt ikke er med
 * i måneden (ikke ansatt / sluttet).
 */
export async function getSalaryContext(
  staffId: string,
  year: number,
  month: number,
): Promise<SalaryContext | null> {
  const [rows, split] = await Promise.all([
    getPayrollForMonth(year, month),
    getRevenueSplit(staffId, year, month),
  ]);
  const row = rows.find((r) => r.staffId === staffId);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!row) {
    // Ansatt uten omsetning/ikke i lønnskjøringen → nøytral kontekst.
    const staff = (await getStaffOptions()).find((s) => s.id === staffId);
    return {
      staffBaseSalaryNok: staff?.base_salary_nok ?? PAYROLL.BASE_NOK,
      employedDays: daysInMonth,
      daysInMonth,
      absenceDays: 0,
      workdays: 0,
      grossInclVatNok: 0,
      serviceInclVatNok: split.service,
      productInclVatNok: split.product,
      splitAvailable: split.available,
      mva: PAYROLL.MVA,
    };
  }
  return {
    staffBaseSalaryNok: row.baseNok,
    employedDays: row.employedDays ?? daysInMonth,
    daysInMonth: row.daysInMonth ?? daysInMonth,
    absenceDays: row.absenceDays ?? 0,
    workdays: row.workdays ?? 0,
    grossInclVatNok: row.grossNok,
    serviceInclVatNok: split.service,
    productInclVatNok: split.product,
    splitAvailable: split.available,
    mva: PAYROLL.MVA,
  };
}
