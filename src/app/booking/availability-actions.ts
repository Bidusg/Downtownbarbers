"use server";

import { createClient } from "@/lib/supabase/server";

/** Resultat av ledig-tid-oppslag: skiller «ingen tider» fra «henting feilet». */
export type SlotsResult = { slots: string[]; error?: boolean };

/** Ledige starttider (HH:MM) for barber + tjeneste + dato. Server-beregnet. */
export async function getAvailableSlots(
  barber: string,
  service: string,
  date: string,
): Promise<SlotsResult> {
  if (!barber || !service || !date) return { slots: [] };
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("available_slots", {
      p_barber: barber,
      p_service: service,
      p_date: date,
    });
    if (error) return { slots: [], error: true };
    return { slots: (data as string[]) ?? [] };
  } catch {
    return { slots: [], error: true };
  }
}

/** Ledige tider for HELE perioden gruppert per dato → { "2026-09-28": ["09:00", …] }. */
export type SlotsRangeResult = {
  byDate: Record<string, string[]>;
  error?: boolean;
};

/**
 * Henter ledige tider for et helt dato-intervall i ETT kall (RPC available_slots_range),
 * slik at booking-veiviseren slipper å hente på nytt for hver dag man bytter til.
 */
export async function getAvailableSlotsRange(
  barber: string,
  service: string,
  fromISO: string,
  toISO: string,
): Promise<SlotsRangeResult> {
  if (!barber || !service || !fromISO || !toISO) return { byDate: {} };
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("available_slots_range", {
      p_barber: barber,
      p_service: service,
      p_from: fromISO,
      p_to: toISO,
    });
    if (error) return { byDate: {}, error: true };
    const rows = (data as { slot_date: string; slot_time: string }[]) ?? [];
    const byDate: Record<string, string[]> = {};
    for (const r of rows) {
      (byDate[r.slot_date] ??= []).push(r.slot_time);
    }
    return { byDate };
  } catch {
    return { byDate: {}, error: true };
  }
}
