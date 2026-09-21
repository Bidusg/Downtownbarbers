"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

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
export async function setBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<{ ok?: true; error?: string }> {
  if (!ALLOWED.includes(status)) return { error: "Ugyldig status." };
  const sb = await createClient();

  // Ingen skjuling av no-show: en ekte time som har passert kan ikke settes til
  // «avbestilt» uten eier/admin – da skal den markeres «Ikke møtt».
  if (status === "cancelled") {
    const { data: b } = await sb
      .from("bookings")
      .select("start_at, customer_id")
      .eq("id", id)
      .maybeSingle();
    if (
      b?.customer_id &&
      new Date(b.start_at as string).getTime() < Date.now()
    ) {
      const me = await getUserRole();
      if (!isAdminRole(me?.role)) {
        return {
          error:
            "En time som har passert kan ikke avbestilles. Marker «Ikke møtt».",
        };
      }
    }
  }

  const { error } = await sb.from("bookings").update({ status }).eq("id", id);
  if (error) return { error: "Kunne ikke oppdatere status." };
  revalidatePath("/admin/bookinger");
  revalidatePath("/admin");
  revalidatePath("/kasse");
  return { ok: true };
}
