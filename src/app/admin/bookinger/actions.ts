"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

const ALLOWED: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

/** Setter status på en booking (avbestill, fullført, no-show osv.). */
export async function setBookingStatus(id: string, status: BookingStatus) {
  if (!ALLOWED.includes(status)) return;
  const sb = await createClient();
  await sb.from("bookings").update({ status }).eq("id", id);
  revalidatePath("/admin/bookinger");
  revalidatePath("/admin");
  revalidatePath("/kasse");
}
