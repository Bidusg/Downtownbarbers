"use server";

import { createClient } from "@/lib/supabase/server";
import { sendBookingConfirmation } from "@/lib/email";
import { isValidEmail, isValidNorwegianPhone, titleCase } from "@/lib/validate";

export type BookingInput = {
  serviceName: string;
  barberName: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:MM
  name: string;
  email: string;
  phone: string;
  price?: string; // vises i e-post
};

export async function createBooking(
  input: BookingInput,
): Promise<{ ok?: true; error?: string; bookingId?: string }> {
  // Server-side validering – klienten kan omgås, så vi stoler aldri på den.
  const name = titleCase(input.name);
  if (!name) return { error: "Navn mangler." };
  if (!isValidEmail(input.email)) return { error: "Ugyldig e-postadresse." };
  if (!isValidNorwegianPhone(input.phone))
    return { error: "Ugyldig norsk telefonnummer." };
  if (!input.date || !input.time)
    return { error: "Dato og tid må velges." };

  try {
    const sb = await createClient();
    const startIso = new Date(`${input.date}T${input.time}:00`).toISOString();

    const { data: bookingId, error } = await sb.rpc("create_booking", {
      p_service: input.serviceName,
      p_barber: input.barberName,
      p_start: startIso,
      p_name: name,
      p_email: input.email.trim(),
      p_phone: input.phone.trim(),
    });

    if (error) {
      // Vanligste årsak: funksjonen create_booking finnes ikke enda i databasen.
      return {
        error:
          "Kunne ikke lagre bookingen. Kjør supabase/setup_all.sql på nytt i Supabase (den legger til create_booking-funksjonen).",
      };
    }

    // E-postbekreftelse (hopper stille over hvis RESEND_API_KEY mangler)
    await sendBookingConfirmation({
      to: input.email.trim(),
      name,
      service: input.serviceName,
      barber: input.barberName,
      date: input.date,
      time: input.time,
      price: input.price ?? "",
    });

    return { ok: true, bookingId: (bookingId as string) ?? undefined };
  } catch {
    return { error: "Noe gikk galt. Er databasen koblet til (.env.local)?" };
  }
}
