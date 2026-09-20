"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const TOKEN_RE = /^[0-9a-f-]{36}$/i;

/** Avbestill egen kommende time fra Min side. */
export async function portalCancel(
  token: string,
  bookingId: string,
): Promise<{ status: string }> {
  if (!TOKEN_RE.test(token) || !bookingId) return { status: "not_found" };
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("portal_cancel_booking", {
      p_token: token,
      p_booking: bookingId,
    });
    if (error) return { status: "error" };
    revalidatePath(`/min-side/${token}`);
    return { status: String(data ?? "not_found") };
  } catch {
    return { status: "error" };
  }
}

/** Ledige tider (HH:MM) for egen booking på en dato (samme barber + tjeneste). */
export async function portalSlots(
  token: string,
  bookingId: string,
  date: string,
): Promise<string[]> {
  if (!TOKEN_RE.test(token) || !bookingId || !date) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("portal_reschedule_slots", {
      p_token: token,
      p_booking: bookingId,
      p_date: date,
    });
    return (data as string[]) ?? [];
  } catch {
    return [];
  }
}

/** Endre tid på egen kommende time. date=yyyy-mm-dd, time=HH:MM. */
export async function portalReschedule(
  token: string,
  bookingId: string,
  date: string,
  time: string,
): Promise<{ status: string }> {
  if (!TOKEN_RE.test(token) || !bookingId || !date || !time)
    return { status: "invalid" };
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("portal_reschedule_booking", {
      p_token: token,
      p_booking: bookingId,
      p_date: date,
      p_time: time,
    });
    if (error) return { status: "error" };
    revalidatePath(`/min-side/${token}`);
    return { status: String(data ?? "error") };
  } catch {
    return { status: "error" };
  }
}
