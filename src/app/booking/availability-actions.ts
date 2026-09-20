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
