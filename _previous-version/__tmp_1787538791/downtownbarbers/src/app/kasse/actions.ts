"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Fullfør en time og registrer salget (fyller omsetning for admin). */
export async function completeBooking(bookingId: string) {
  const sb = await createClient();

  const { data: b } = await sb
    .from("bookings")
    .select("staff_id, customer_id, service_id, price_nok")
    .eq("id", bookingId)
    .maybeSingle();

  await sb
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", bookingId);

  if (b) {
    const { data: sale } = await sb
      .from("sales")
      .insert({
        booking_id: bookingId,
        staff_id: b.staff_id,
        customer_id: b.customer_id,
        total_nok: b.price_nok,
      })
      .select("id")
      .maybeSingle();

    if (sale && b.service_id) {
      await sb.from("sale_items").insert({
        sale_id: sale.id,
        kind: "service",
        ref_id: b.service_id,
        quantity: 1,
        price_nok: b.price_nok,
      });
    }
  }

  revalidatePath("/kasse");
}

/** Marker som ikke møtt. */
export async function markNoShow(bookingId: string) {
  const sb = await createClient();
  await sb.from("bookings").update({ status: "no_show" }).eq("id", bookingId);
  revalidatePath("/kasse");
}
