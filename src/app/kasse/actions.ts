"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  sendBookingConfirmation,
  sendReceiptEmail,
  sendNoShowEmail,
} from "@/lib/email";

function refresh() {
  revalidatePath("/kasse");
  revalidatePath("/kasse/kalender");
}

function fmtDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  } catch {
    return iso;
  }
}
function fmtClock(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export type CompleteOptions = {
  paymentMethod?: string;
  /** Kundeinfo som fylles inn ved betaling (drop-in) – lagres i CRM. */
  customer?: { name?: string; email?: string; phone?: string };
  /** Send kvittering på e-post. */
  sendReceipt?: boolean;
};

/**
 * Fullfør en time: registrer salget + betalingsmåte, oppdater evt. kundeinfo
 * i CRM (drop-in), og send kvittering på e-post hvis ønsket.
 */
export async function completeBooking(
  bookingId: string,
  opts?: CompleteOptions | string,
) {
  // Bakoverkompatibelt: tidligere signatur var (id, paymentMethod: string).
  const o: CompleteOptions =
    typeof opts === "string" ? { paymentMethod: opts } : (opts ?? {});

  const sb = await createClient();

  const { data: b } = await sb
    .from("bookings")
    .select(
      "staff_id, customer_id, service_id, price_nok, start_at, services(name), staff(full_name)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  await sb.from("bookings").update({ status: "completed" }).eq("id", bookingId);

  if (b) {
    const { data: sale } = await sb
      .from("sales")
      .insert({
        booking_id: bookingId,
        staff_id: b.staff_id,
        customer_id: b.customer_id,
        total_nok: b.price_nok,
        payment_method: o.paymentMethod ?? null,
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

    // Legg inn / oppdater kundeinfo i CRM (typisk for drop-in ved betaling).
    const info = o.customer;
    if (
      b.customer_id &&
      info &&
      (info.name?.trim() || info.email?.trim() || info.phone?.trim())
    ) {
      const patch: Record<string, string> = {};
      if (info.name?.trim()) patch.full_name = info.name.trim();
      if (info.email?.trim()) patch.email = info.email.trim();
      if (info.phone?.trim()) patch.phone = info.phone.trim();
      await sb.from("customers").update(patch).eq("id", b.customer_id);
    }

    // Kvittering på e-post.
    if (o.sendReceipt) {
      let email = info?.email?.trim();
      let name = info?.name?.trim();
      if (!email || !name) {
        const { data: c } = await sb
          .from("customers")
          .select("full_name, email")
          .eq("id", b.customer_id)
          .maybeSingle();
        email = email || (c?.email ?? undefined);
        name = name || (c?.full_name ?? "");
      }
      if (email) {
        const s = b.services as { name?: string } | null;
        const st = b.staff as { full_name?: string } | null;
        await sendReceiptEmail({
          to: email,
          name: name ?? "",
          service: s?.name ?? "",
          barber: st?.full_name ?? "",
          date: fmtDay(b.start_at),
          price: `${b.price_nok} kr`,
          paymentMethod: o.paymentMethod,
        });
      }
    }
  }

  refresh();
}

/**
 * Marker som ikke møtt. Kan valgfritt sende et vennlig gebyr-/påminnelsesvarsel
 * på e-post til kunden (hvis de har e-post). Gebyrbeløpet styres server-side
 * via NO_SHOW_FEE_NOK, slik at shop aldri ser kroner.
 */
export async function markNoShow(
  bookingId: string,
  opts?: { notify?: boolean },
): Promise<{ ok?: true; emailed?: boolean; error?: string }> {
  const sb = await createClient();

  await sb.from("bookings").update({ status: "no_show" }).eq("id", bookingId);

  let emailed = false;
  if (opts?.notify) {
    const { data: b } = await sb
      .from("bookings")
      .select(
        "start_at, customers(full_name, email), services(name), staff(full_name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    const c = b?.customers as { full_name?: string; email?: string } | null;
    if (b && c?.email) {
      const s = b.services as { name?: string } | null;
      const st = b.staff as { full_name?: string } | null;
      const feeNok = Number(process.env.NO_SHOW_FEE_NOK ?? "");
      emailed = await sendNoShowEmail({
        to: c.email,
        name: c.full_name ?? "",
        service: s?.name ?? "",
        barber: st?.full_name ?? "",
        date: fmtDay(b.start_at),
        fee: feeNok > 0 ? `${feeNok} kr` : undefined,
      });
    }
  }

  refresh();
  return { ok: true, emailed };
}

/** Avlys en booking. */
export async function cancelBooking(bookingId: string) {
  const sb = await createClient();
  await sb.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
  refresh();
}

/** Flytt en booking til ny tid (og evt. ny barber). */
export async function rescheduleBooking(
  bookingId: string,
  startIso: string,
  barber?: string,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("reschedule_booking", {
      p_booking: bookingId,
      p_start: startIso,
      p_barber: barber ?? null,
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke flytte timen." };
  }
}

export type DeskBookingInput = {
  customerId?: string;
  name?: string;
  email?: string;
  phone?: string;
  service: string;
  barber: string;
  start: string; // ISO
};

/** Opprett booking fra skranken – eksisterende kunde eller ny (drop-in). */
export async function createDeskBooking(
  input: DeskBookingInput,
): Promise<{ ok?: true; error?: string }> {
  if (!input.service || !input.barber || !input.start) {
    return { error: "Velg tjeneste, barber og tid." };
  }
  try {
    const sb = await createClient();
    let newId: string | null = null;

    if (input.customerId) {
      const { data, error } = await sb.rpc("create_booking_for_customer", {
        p_customer: input.customerId,
        p_service: input.service,
        p_barber: input.barber,
        p_start: input.start,
      });
      if (error) return { error: error.message };
      newId = (data as string) ?? null;
    } else {
      if (!input.name || !input.name.trim()) return { error: "Navn mangler." };
      const { data, error } = await sb.rpc("create_booking", {
        p_service: input.service,
        p_barber: input.barber,
        p_start: input.start,
        p_name: input.name.trim(),
        p_email: (input.email ?? "").trim(),
        p_phone: (input.phone ?? "").trim(),
      });
      if (error) return { error: error.message };
      newId = (data as string) ?? null;
    }

    // Send bekreftelse på e-post hvis kunden har e-post (også rebooking).
    if (newId) {
      const { data: bk } = await sb
        .from("bookings")
        .select(
          "price_nok, start_at, customers(full_name, email), services(name), staff(full_name)",
        )
        .eq("id", newId)
        .maybeSingle();
      const c = bk?.customers as { full_name?: string; email?: string } | null;
      if (bk && c?.email) {
        const s = bk.services as { name?: string } | null;
        const st = bk.staff as { full_name?: string } | null;
        await sendBookingConfirmation({
          to: c.email,
          name: c.full_name ?? input.name ?? "",
          service: s?.name ?? input.service,
          barber: st?.full_name ?? input.barber,
          date: fmtDay(bk.start_at),
          time: fmtClock(bk.start_at),
          price: `${bk.price_nok} kr`,
        });
      }
    }

    refresh();
    return { ok: true };
  } catch {
    return { error: "Noe gikk galt ved booking." };
  }
}

/** Send (eller send på nytt) kvittering for en enkelt booking. */
export async function sendReceiptForBooking(
  bookingId: string,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();
    const { data: b } = await sb
      .from("bookings")
      .select(
        "price_nok, start_at, customers(full_name, email), services(name), staff(full_name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    const c = b?.customers as { full_name?: string; email?: string } | null;
    if (!b) return { error: "Fant ikke bookingen." };
    if (!c?.email) return { error: "Kunden mangler e-postadresse." };
    const s = b.services as { name?: string } | null;
    const st = b.staff as { full_name?: string } | null;
    await sendReceiptEmail({
      to: c.email,
      name: c.full_name ?? "",
      service: s?.name ?? "",
      barber: st?.full_name ?? "",
      date: fmtDay(b.start_at),
      price: `${b.price_nok} kr`,
    });
    return { ok: true };
  } catch {
    return { error: "Kunne ikke sende kvittering." };
  }
}

export type CustomerHit = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  visits: number;
  last_visit: string | null;
};

/** Søk opp kunde i skranken. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  if (!q || q.trim().length < 2) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("shop_customer_search", { p_q: q.trim() });
    // Shop ser ikke telefonnummer – fjernes før det når nettleseren.
    return ((data as CustomerHit[]) ?? []).map((h) => ({ ...h, phone: null }));
  } catch {
    return [];
  }
}

/** Ledige starttider (HH:MM) for barber + tjeneste + dato. */
export async function getSlots(
  barber: string,
  service: string,
  date: string,
): Promise<string[]> {
  if (!barber || !service || !date) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("available_slots", {
      p_barber: barber,
      p_service: service,
      p_date: date,
    });
    return (data as string[]) ?? [];
  } catch {
    return [];
  }
}
