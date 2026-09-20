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

/** Produktlinje ved betaling (voks/sjampo o.l.). Pris hentes server-side. */
export type SaleProduct = { id: string; qty: number };

export type CompleteOptions = {
  paymentMethod?: string;
  /** Kundeinfo som fylles inn ved betaling (drop-in) – lagres i CRM. */
  customer?: { name?: string; email?: string; phone?: string };
  /** Send kvittering på e-post. */
  sendReceipt?: boolean;
  /** Produkter som selges sammen med timen (varesalg over disk). */
  products?: SaleProduct[];
};

export type CompleteResult = { ok?: true; error?: string };

/**
 * Fullfør en time: registrer salget (tjeneste + evt. produkter) atomisk,
 * oppdater evt. kundeinfo i CRM (drop-in), og send kvittering hvis ønsket.
 *
 * VIKTIG: selve salget skrives via record_sale-RPC-en (én transaksjon:
 * sale + sale_items + lager + status). Feiler den, markeres IKKE timen
 * fullført, og feilen returneres slik at kassen kan vise den – i stedet
 * for at et salg forsvinner uten spor (jf. live-test 19. sept).
 */
export async function completeBooking(
  bookingId: string,
  opts?: CompleteOptions | string,
): Promise<CompleteResult> {
  // Bakoverkompatibelt: tidligere signatur var (id, paymentMethod: string).
  const o: CompleteOptions =
    typeof opts === "string" ? { paymentMethod: opts } : (opts ?? {});

  const sb = await createClient();

  // Booking-info til CRM/kvittering (leses før salget registreres).
  const { data: b } = await sb
    .from("bookings")
    .select(
      "customer_id, price_nok, start_at, services(name), staff(full_name)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  // Registrer salget atomisk. Prisene settes server-side (booking + products).
  const products = (o.products ?? [])
    .filter((p) => p && p.id)
    .map((p) => ({ id: p.id, qty: Math.max(1, Math.floor(p.qty || 1)) }));
  const { error: saleErr } = await sb.rpc("record_sale", {
    p_booking: bookingId,
    p_payment_method: o.paymentMethod ?? null,
    p_products: products,
  });
  if (saleErr) {
    return {
      error:
        saleErr.message ||
        "Salget ble ikke registrert. Ingenting er lagret – prøv igjen.",
    };
  }

  // --- Alt under er best-effort. Salget er allerede trygt registrert. ---

  // Legg inn / oppdater kundeinfo i CRM (typisk for drop-in ved betaling).
  const info = o.customer;
  if (
    b?.customer_id &&
    info &&
    (info.name?.trim() || info.email?.trim() || info.phone?.trim())
  ) {
    const patch: Record<string, string> = {};
    if (info.name?.trim()) patch.full_name = info.name.trim();
    if (info.email?.trim()) patch.email = info.email.trim();
    if (info.phone?.trim()) patch.phone = info.phone.trim();
    await sb.from("customers").update(patch).eq("id", b.customer_id);
  }

  // Kvittering på e-post (degraderer stille – ikke en del av salgsintegriteten).
  if (o.sendReceipt && b) {
    let email = info?.email?.trim();
    let name = info?.name?.trim();
    if ((!email || !name) && b.customer_id) {
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

  refresh();
  return { ok: true };
}

/**
 * Angre en fullført / ikke-møtt time (feiltrykk på nettbrettet). Sletter
 * salget, tilbakefører produktlager og setter timen tilbake til bekreftet.
 */
export async function reopenBooking(
  bookingId: string,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("reopen_booking", { p_booking: bookingId });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke angre. Prøv igjen." };
  }
}

export type SellableProduct = { id: string; name: string; price_nok: number };

/** Produkter som kan selges over disk i kassen (aktive, ikke gavekort). */
export async function listSellableProducts(): Promise<SellableProduct[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("products")
      .select("id, name, price_nok, is_gift_card, active")
      .eq("active", true)
      .eq("is_gift_card", false)
      .order("name");
    return ((data as SellableProduct[]) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price_nok: Number(p.price_nok) || 0,
    }));
  } catch {
    return [];
  }
}

export type SellableService = { name: string; price_nok: number };

/** Aktive behandlinger som kan selges i kassen (med pris). */
export async function listSellableServices(): Promise<SellableService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("name, price_nok, active, sort_order")
      .eq("active", true)
      .order("sort_order");
    return ((data as SellableService[]) ?? []).map((s) => ({
      name: s.name,
      price_nok: Number(s.price_nok) || 0,
    }));
  } catch {
    return [];
  }
}

export type WalkinInput = {
  staffId?: string;
  paymentMethod: string;
  service?: string;
  products?: SaleProduct[];
  customer?: { name?: string; email?: string; phone?: string };
  makeMember?: boolean;
};

/**
 * Hurtigsalg / drop-in uten booking: behandling og/eller varer over disk,
 * med valgfri kundeinfo (lagres i kartoteket) og valgfritt medlemskap
 * (samtykke). Priser settes server-side i record_walkin_sale.
 */
export async function recordWalkinSale(
  input: WalkinInput,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();
    const products = (input.products ?? [])
      .filter((p) => p && p.id)
      .map((p) => ({ id: p.id, qty: Math.max(1, Math.floor(p.qty || 1)) }));
    const c = input.customer;
    const customer =
      c && (c.name?.trim() || c.email?.trim() || c.phone?.trim())
        ? {
            name: c.name?.trim() || null,
            email: c.email?.trim() || null,
            phone: c.phone?.trim() || null,
          }
        : null;
    const { error } = await sb.rpc("record_walkin_sale", {
      p_staff: input.staffId || null,
      p_payment_method: input.paymentMethod ?? null,
      p_service: input.service?.trim() || null,
      p_products: products,
      p_customer: customer,
      p_make_member: !!input.makeMember,
    });
    if (error) {
      return {
        error: error.message || "Salget ble ikke registrert. Prøv igjen.",
      };
    }
    refresh();
    return { ok: true };
  } catch {
    return { error: "Noe gikk galt. Prøv igjen." };
  }
}

/** Tjenesteprisen for en booking (til totalvisning i kassen). */
export async function getBookingPrice(bookingId: string): Promise<number> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("bookings")
      .select("price_nok")
      .eq("id", bookingId)
      .maybeSingle();
    return Number(data?.price_nok) || 0;
  } catch {
    return 0;
  }
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

/**
 * Blokker tid / legg inn pause for en barber. Lagres som en booking uten kunde
 * eller tjeneste, så `available_slots` automatisk sperrer tiden for nettbooking
 * og blokken vises i kalenderen.
 */
export async function blockTime(
  barber: string,
  startIso: string,
  endIso: string,
  reason: string,
): Promise<{ ok?: true; error?: string }> {
  if (!barber || !startIso || !endIso) return { error: "Mangler felt." };
  if (new Date(endIso) <= new Date(startIso))
    return { error: "Sluttid må være etter starttid." };
  try {
    const sb = await createClient();
    const { data: s } = await sb
      .from("staff")
      .select("id")
      .eq("full_name", barber)
      .eq("active", true)
      .maybeSingle();
    if (!s) return { error: "Fant ikke barberen." };
    const { error } = await sb.from("bookings").insert({
      staff_id: s.id,
      start_at: startIso,
      end_at: endIso,
      status: "confirmed",
      price_nok: 0,
      notes: reason.trim() || "Blokkert",
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke blokkere tiden." };
  }
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

/**
 * Flytt en booking til en ANNEN barber – krever at den OPPRINNELIGE barberen
 * godkjenner med sin PIN (samme PIN som stemplingsuret). Tidspunktet beholdes;
 * krediteringen følger bookingen, så den nye barberen krediteres salget.
 */
export async function reassignBookingBarber(
  bookingId: string,
  newBarber: string,
  pin: string,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();

    const { data: b } = await sb
      .from("bookings")
      .select("staff_id, start_at, staff(full_name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) return { error: "Fant ikke timen." };
    if (!b.staff_id)
      return { error: "Timen har ingen barber å godkjenne overføringen fra." };

    const current = (b.staff as { full_name?: string } | null)?.full_name ?? null;
    if (current && current === newBarber)
      return { error: "Kunden står allerede hos denne barberen." };
    if (!/^\d{4}$/.test(pin.trim()))
      return { error: "PIN må være 4 siffer." };

    // Godkjenning: opprinnelig barber taster sin PIN.
    const { data: v, error: verr } = await sb.rpc("verify_pin_status", {
      p_staff: b.staff_id,
      p_pin: pin.trim(),
    });
    if (verr) return { error: "Kunne ikke verifisere PIN." };
    const res = String(v ?? "");
    if (res === "ERR:no_pin")
      return {
        error: `${current ?? "Barberen"} har ingen PIN satt. Be admin registrere en under Ansatte.`,
      };
    if (res.startsWith("ERR:")) return { error: "Feil PIN. Overføring avbrutt." };

    // Godkjent → flytt til ny barber, behold tidspunktet.
    const { error } = await sb.rpc("reschedule_booking", {
      p_booking: bookingId,
      p_start: b.start_at,
      p_barber: newBarber,
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
