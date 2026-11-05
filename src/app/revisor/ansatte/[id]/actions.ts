"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, getUserRole } from "@/lib/auth";
import { periodKey } from "@/lib/salary/queries";
import type { SalarySettings, SalaryPeriodInputs } from "@/lib/salary/types";

/* =====================================================================
 * Server actions for lønnssiden per ansatt. Kun admin/eier/revisor.
 * Degraderer trygt: hvis SQL (KJØR-I-SUPABASE-LONN-ANSATT.sql) ikke er
 * kjørt, returneres en tydelig feilmelding i stedet for å krasje.
 * ===================================================================== */

export type ActionResult = { ok?: true; error?: string };

const SQL_HINT =
  "Lønnstabellene mangler – kjør KJØR-I-SUPABASE-LONN-ANSATT.sql i Supabase.";

const SQL_HINT_REPORT =
  "Nye lønnsfelt mangler – kjør KJØR-I-SUPABASE-LONNSRAPPORT.sql i Supabase.";
const NEW_COLS = /tax_percent|hours_per_month|account_number|overtime50_hours|overtime100_hours|holiday_hours|correction_nok|tax_nok|worked_hours/;

function missingTable(msg: string | undefined): boolean {
  return !!msg && /relation|does not exist|schema cache|salary_/i.test(msg);
}

function toNum(fd: FormData, key: string, fallback = 0): number {
  const v = Number(String(fd.get(key) ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
}
function toBool(fd: FormData, key: string): boolean {
  const v = String(fd.get(key) ?? "");
  return v === "on" || v === "true" || v === "1";
}
function toTime(fd: FormData, key: string, fallback: string): string {
  const v = String(fd.get(key) ?? "").trim();
  return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
}

export async function saveSalarySettings(fd: FormData): Promise<ActionResult> {
  await requireRole(["revisor", "admin"]);
  const me = await getUserRole();
  const staffId = String(fd.get("staffId") ?? "");
  if (!staffId) return { error: "Mangler ansatt-id." };

  const baseOverrideRaw = String(fd.get("baseSalaryOverrideNok") ?? "").trim();
  const settings: SalarySettings = {
    baseSalaryOverrideNok: baseOverrideRaw === "" ? null : toNum(fd, "baseSalaryOverrideNok"),
    commissionModel: String(fd.get("commissionModel")) === "split" ? "split" : "terskel",
    commissionRate: toNum(fd, "commissionRate", 0.4),
    commissionThresholdNok: toNum(fd, "commissionThresholdNok", 72000),
    commissionExVat: toBool(fd, "commissionExVat"),
    serviceRate: toNum(fd, "serviceRate", 0.4),
    productRate: toNum(fd, "productRate", 0.1),
    marketplaceRate: toNum(fd, "marketplaceRate", 0.4),
    enableMarketplace: toBool(fd, "enableMarketplace"),
    enableEvening: toBool(fd, "enableEvening"),
    eveningFrom: toTime(fd, "eveningFrom", "19:00"),
    eveningRateNok: toNum(fd, "eveningRateNok", 45),
    enableSaturday: toBool(fd, "enableSaturday"),
    saturdayFrom: toTime(fd, "saturdayFrom", "15:00"),
    saturdayRateNok: toNum(fd, "saturdayRateNok", 45),
    enableSunday: toBool(fd, "enableSunday"),
    sundayRateNok: toNum(fd, "sundayRateNok", 45),
    enableVacationPay: toBool(fd, "enableVacationPay"),
    vacationPayRate: toNum(fd, "vacationPayRate", 0.12),
    enableHolidayBonus: toBool(fd, "enableHolidayBonus"),
    holidayBonusNok: toNum(fd, "holidayBonusNok", 0),
    enableSickPay: toBool(fd, "enableSickPay"),
    sickRateNok: toNum(fd, "sickRateNok", 0),
    taxPercent: Math.min(1, Math.max(0, toNum(fd, "taxPercent", 0))),
    hoursPerMonth: toNum(fd, "hoursPerMonth", 162.5) > 0 ? toNum(fd, "hoursPerMonth", 162.5) : 162.5,
    accountNumber: String(fd.get("accountNumber") ?? "").replace(/[^\d.\s]/g, "").trim().slice(0, 20),
  };

  try {
    const sb = await createClient();
    const { error } = await sb.from("salary_settings").upsert(
      {
        staff_id: staffId,
        base_salary_override_nok: settings.baseSalaryOverrideNok,
        commission_model: settings.commissionModel,
        commission_rate: settings.commissionRate,
        commission_threshold_nok: settings.commissionThresholdNok,
        commission_ex_vat: settings.commissionExVat,
        service_rate: settings.serviceRate,
        product_rate: settings.productRate,
        marketplace_rate: settings.marketplaceRate,
        enable_marketplace: settings.enableMarketplace,
        enable_evening: settings.enableEvening,
        evening_from: settings.eveningFrom,
        evening_rate_nok: settings.eveningRateNok,
        enable_saturday: settings.enableSaturday,
        saturday_from: settings.saturdayFrom,
        saturday_rate_nok: settings.saturdayRateNok,
        enable_sunday: settings.enableSunday,
        sunday_rate_nok: settings.sundayRateNok,
        enable_vacation_pay: settings.enableVacationPay,
        vacation_pay_rate: settings.vacationPayRate,
        enable_holiday_bonus: settings.enableHolidayBonus,
        holiday_bonus_nok: settings.holidayBonusNok,
        enable_sick_pay: settings.enableSickPay,
        sick_rate_nok: settings.sickRateNok,
        tax_percent: settings.taxPercent,
        hours_per_month: settings.hoursPerMonth,
        account_number: settings.accountNumber || null,
        updated_at: new Date().toISOString(),
        updated_by: me?.userId ?? null,
      },
      { onConflict: "staff_id" },
    );
    if (error) {
      if (NEW_COLS.test(error.message)) return { error: SQL_HINT_REPORT };
      return { error: missingTable(error.message) ? SQL_HINT : error.message };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lagring feilet." };
  }

  revalidatePath(`/revisor/ansatte/${staffId}`);
  revalidatePath("/admin/lonn");
  return { ok: true };
}

export async function saveSalaryPeriod(fd: FormData): Promise<ActionResult> {
  await requireRole(["revisor", "admin"]);
  const me = await getUserRole();
  const staffId = String(fd.get("staffId") ?? "");
  const year = Number(fd.get("year"));
  const month = Number(fd.get("month"));
  if (!staffId || !year || !month) return { error: "Mangler ansatt/periode." };

  const period: SalaryPeriodInputs = {
    eveningHours: toNum(fd, "eveningHours"),
    saturdayHours: toNum(fd, "saturdayHours"),
    sundayHours: toNum(fd, "sundayHours"),
    sickHours: toNum(fd, "sickHours"),
    vacationHours: toNum(fd, "vacationHours"),
    overtime50Hours: toNum(fd, "overtime50Hours"),
    overtime100Hours: toNum(fd, "overtime100Hours"),
    holidayHours: toNum(fd, "holidayHours"),
    correctionNok: toNum(fd, "correctionNok"),
    taxNok: String(fd.get("taxNok") ?? "").trim() === "" ? null : toNum(fd, "taxNok"),
    workedHours: String(fd.get("workedHours") ?? "").trim() === "" ? null : toNum(fd, "workedHours"),
    note: String(fd.get("note") ?? "").trim(),
  };

  try {
    const sb = await createClient();
    const { error } = await sb.from("salary_period").upsert(
      {
        staff_id: staffId,
        period: periodKey(year, month),
        evening_hours: period.eveningHours,
        saturday_hours: period.saturdayHours,
        sunday_hours: period.sundayHours,
        sick_hours: period.sickHours,
        vacation_hours: period.vacationHours,
        overtime50_hours: period.overtime50Hours,
        overtime100_hours: period.overtime100Hours,
        holiday_hours: period.holidayHours,
        correction_nok: period.correctionNok,
        tax_nok: period.taxNok,
        worked_hours: period.workedHours,
        note: period.note || null,
        updated_at: new Date().toISOString(),
        updated_by: me?.userId ?? null,
      },
      { onConflict: "staff_id,period" },
    );
    if (error) {
      if (NEW_COLS.test(error.message)) return { error: SQL_HINT_REPORT };
      return { error: missingTable(error.message) ? SQL_HINT : error.message };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lagring feilet." };
  }

  revalidatePath(`/revisor/ansatte/${staffId}`);
  revalidatePath("/admin/lonn");
  return { ok: true };
}

export async function addManualLine(fd: FormData): Promise<ActionResult> {
  await requireRole(["revisor", "admin"]);
  const me = await getUserRole();
  const staffId = String(fd.get("staffId") ?? "");
  const year = Number(fd.get("year"));
  const month = Number(fd.get("month"));
  const label = String(fd.get("label") ?? "").trim();
  const amount = toNum(fd, "amountNok");
  if (!staffId || !year || !month) return { error: "Mangler ansatt/periode." };
  if (!label) return { error: "Skriv en beskrivelse." };
  if (!amount) return { error: "Beløpet kan ikke være 0." };

  try {
    const sb = await createClient();
    const { error } = await sb.from("salary_period_lines").insert({
      staff_id: staffId,
      period: periodKey(year, month),
      label,
      amount_nok: amount,
      sort: Math.floor(Date.now() / 1000),
      created_by: me?.userId ?? null,
    });
    if (error) return { error: missingTable(error.message) ? SQL_HINT : error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lagring feilet." };
  }

  revalidatePath(`/revisor/ansatte/${staffId}`);
  return { ok: true };
}

export async function deleteManualLine(fd: FormData): Promise<ActionResult> {
  await requireRole(["revisor", "admin"]);
  const staffId = String(fd.get("staffId") ?? "");
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Mangler linje-id." };

  try {
    const sb = await createClient();
    const { error } = await sb.from("salary_period_lines").delete().eq("id", id);
    if (error) return { error: missingTable(error.message) ? SQL_HINT : error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sletting feilet." };
  }

  revalidatePath(`/revisor/ansatte/${staffId}`);
  return { ok: true };
}
