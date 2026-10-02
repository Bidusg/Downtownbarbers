"use server";

import { requireRole } from "@/lib/auth";
import { tripletexPing } from "@/lib/tripletex/client";
import { tripletexConfigured } from "@/lib/tripletex/config";
import { buildDailyVoucherPlan, type DailyVoucherPlan } from "@/lib/tripletex/voucher";
import { probeFinancialData, type TripletexProbe } from "@/lib/tripletex/read";

function osloYesterday(): string {
  const todayOslo = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
  const d = new Date(`${todayOslo}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type TripletexTestResult = {
  date: string;
  connection:
    | { ok: true; company: string }
    | { ok: false; error: string }
    | { ok: false; error: "not_configured" };
  plan: DailyVoucherPlan | null;
  planError?: string;
};

/**
 * Trygg admin-test av Tripletex-broen: verifiserer pålogging (viser selskap)
 * og forhåndsviser dagsbilaget for en dato. Oppretter/poster INGENTING.
 */
export async function testTripletex(date?: string): Promise<TripletexTestResult> {
  await requireRole(["admin"]);
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : osloYesterday();

  const connection = tripletexConfigured()
    ? await tripletexPing()
    : ({ ok: false, error: "not_configured" } as const);

  let plan: DailyVoucherPlan | null = null;
  let planError: string | undefined;
  try {
    plan = await buildDailyVoucherPlan(d);
  } catch (e) {
    planError = e instanceof Error ? e.message : String(e);
  }

  return { date: d, connection, plan, planError };
}

/**
 * Diagnostikk (Fase 1 av regnskapsimport): henter små rå-utsnitt fra Tripletex
 * sine regnskaps-endepunkter (kontoplan, saldobalanse, hovedbok, bilag, mva) så
 * vi kan bekrefte den eksakte dataformen før vi bygger synken. Leser kun –
 * oppretter/endrer ingenting. Admin-only.
 */
export async function probeTripletexData(
  dateFrom?: string,
  dateTo?: string,
): Promise<{ configured: boolean; probe: TripletexProbe | null; error?: string }> {
  await requireRole(["admin"]);
  if (!tripletexConfigured()) return { configured: false, probe: null };
  try {
    const probe = await probeFinancialData(dateFrom, dateTo);
    return { configured: true, probe };
  } catch (e) {
    return { configured: true, probe: null, error: e instanceof Error ? e.message : String(e) };
  }
}
