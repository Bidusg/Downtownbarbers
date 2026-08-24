"use server";

import { createClient } from "@/lib/supabase/server";

export type BookingInput = {
  serviceName: string;
  barberName: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:MM
  name: string;
  email: string;
  phone: string;
};

export async function createBooking(
  input: BookingInput,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();

    const { data: svc } = await sb
      .from("services")
      .select("id, price_nok, duration_min")
      .eq("name", input.serviceName)
      .maybeSingle();

    const { data: staff } = await sb
      .from("staff")
      .select("id")
      .eq("full_name", input.barberName)
      .maybeSingle();

    const { data: customer } = await sb
      .from("customers")
      .insert({
        full_name: input.name,
        email: input.email,
        phone: input.phone,
      })
      .select("id")
      .maybeSingle();

    const start = new Date(`${input.date}T${input.time}:00`);
    const end = new Date(
      start.getTime() + (svc?.duration_min ?? 30) * 60000,
    );

    const { error } = await sb.from("bookings").insert({
      customer_id: customer?.id ?? null,
      staff_id: staff?.id ?? null,
      service_id: svc?.id ?? null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: "confirmed",
      price_nok: svc?.price_nok ?? 0,
    });

    if (error) return { error: "Kunne ikke lagre bookingen. Prøv igjen." };
    return { ok: true };
  } catch {
    return {
      error: "Noe gikk galt. Er databasen koblet til (.env.local)?",
    };
  }
}
