"use server";

import { createClient } from "@/lib/supabase/server";

/** Ledige starttider (HH:MM) for barber + tjeneste + dato. Server-beregnet. */
export async function getAvailableSlots(
  barber: string,
  service: string,
  date: string,
): Promise<string[]> {
  if (!barber || !service || !date) return [];
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("available_slots", {
      p_barber: barber,
      p_service: service,
      p_date: date,
    });
    if (error || !data) return [];
    return data as string[];
  } catch {
    return [];
  }
}
