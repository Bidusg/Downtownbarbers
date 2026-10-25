import { createServiceClient } from "@/lib/supabase/service";
import { sendBookingChange, sendUnsubscribeConfirmation } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import type { Lang } from "@/lib/i18n/dictionary";

/* =====================================================================
 * BEKREFTELSER PÅ KUNDENS EGNE HANDLINGER
 *   Kalles etter at handlingen er lagret. Alt er beste-innsats: feiler
 *   e-posten, er handlingen likevel gjort.
 * ===================================================================== */

function osloTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
}

type BookingRow = {
  id: string;
  start_at: string;
  services: { name?: string } | null;
  staff: { full_name?: string; title?: string | null; photo_url?: string | null } | null;
  customers: { full_name?: string; email?: string | null; lang?: string | null; portal_token?: string | null } | null;
};

async function loadBooking(id: string): Promise<BookingRow | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("bookings")
    .select("id, start_at, services(name), staff(full_name, title, photo_url), customers(full_name, email, lang, portal_token)")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as BookingRow | null) ?? null;
}

/** Kunden har avbestilt eller flyttet timen selv (Min side / avbestill-lenke). */
export async function notifyBookingChange(bookingId: string, kind: "cancelled" | "moved"): Promise<void> {
  try {
    const b = await loadBooking(bookingId);
    const to = b?.customers?.email?.trim();
    if (!b || !to) return;
    const base = siteUrl();
    let cancelUrl: string | undefined;
    if (kind === "moved") {
      try {
        const { data: tok } = await createServiceClient().rpc("booking_cancel_token", { p_booking: bookingId });
        if (tok) cancelUrl = `${base}/avbestill/${tok}`;
      } catch {
        /* uten avbestillingslenke */
      }
    }
    await sendBookingChange({
      to,
      kind,
      name: b.customers?.full_name ?? "",
      service: b.services?.name ?? "",
      barber: b.staff?.full_name ?? "",
      date: b.start_at,
      time: osloTime(b.start_at),
      portalUrl: b.customers?.portal_token ? `${base}/min-side/${b.customers.portal_token}` : undefined,
      cancelUrl,
      barberTitle: b.staff?.title ?? undefined,
      barberPhotoUrl: b.staff?.photo_url ?? undefined,
      lang: (b.customers?.lang as Lang | null) ?? "no",
    });
  } catch (e) {
    console.error("notifyBookingChange:", e instanceof Error ? e.message : e);
  }
}

/**
 * Avbestilt via lenken i e-posten: vi kjenner bare lenke-tokenet. Finn
 * timen som nettopp ble avbestilt av kunden med samme starttid og navn.
 */
export async function notifyCancelByToken(info: {
  start_at: string | null;
  customer_name: string | null;
}): Promise<void> {
  try {
    if (!info.start_at) return;
    const svc = createServiceClient();
    const { data } = await svc
      .from("bookings")
      .select("id, customers(full_name)")
      .eq("start_at", info.start_at)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false, nullsFirst: false })
      .limit(5);
    const rows = (data ?? []) as unknown as { id: string; customers: { full_name?: string } | null }[];
    const want = (info.customer_name ?? "").trim().toLowerCase();
    const hit = rows.find((r) => (r.customers?.full_name ?? "").trim().toLowerCase() === want) ?? (rows.length === 1 ? rows[0] : null);
    if (hit) await notifyBookingChange(hit.id, "cancelled");
  } catch (e) {
    console.error("notifyCancelByToken:", e instanceof Error ? e.message : e);
  }
}

/**
 * Meld av nyhetsbrevet (avmeldingslenke eller Gmail sin «Meld av»-knapp) og
 * send «Du er meldt av» – men bare første gang, ikke ved nye klikk.
 * Returnerer kundens navn (som marketing_unsubscribe), eller null.
 */
export async function unsubscribeWithReceipt(token: string): Promise<string | null> {
  const svc = createServiceClient();
  type Before = { full_name: string | null; email: string | null; lang: string | null; marketing_consent: boolean | null };
  let before = null as Before | null;
  try {
    const { data } = await svc
      .from("customers")
      .select("full_name, email, lang, marketing_consent")
      .eq("portal_token", token)
      .maybeSingle();
    before = (data as Before | null) ?? null;
  } catch {
    /* fortsett – selve avmeldingen er det viktige */
  }
  const { data: name } = await svc.rpc("marketing_unsubscribe", { p_token: token });
  if (name && before?.email && before.marketing_consent) {
    try {
      await sendUnsubscribeConfirmation({
        to: before.email,
        name: before.full_name,
        channel: "email",
        lang: (before.lang as Lang | null) ?? "no",
      });
    } catch (e) {
      console.error("unsubscribeWithReceipt:", e instanceof Error ? e.message : e);
    }
  }
  return (name as string | null) ?? null;
}

/** SMS STOPP: bekreft på e-post til kundene med dette nummeret. */
export async function notifySmsStop(phone: string): Promise<void> {
  try {
    const key = phone.replace(/\D/g, "").slice(-8);
    if (key.length < 8) return;
    const { data } = await createServiceClient()
      .from("customers")
      .select("full_name, email, lang, phone")
      .ilike("phone", `%${key}`)
      .limit(5);
    const seen = new Set<string>();
    for (const c of (data ?? []) as { full_name: string | null; email: string | null; lang: string | null; phone: string | null }[]) {
      const to = c.email?.trim().toLowerCase();
      if (!to || seen.has(to) || (c.phone ?? "").replace(/\D/g, "").slice(-8) !== key) continue;
      seen.add(to);
      await sendUnsubscribeConfirmation({ to, name: c.full_name, channel: "sms", lang: (c.lang as Lang | null) ?? "no" });
    }
  } catch (e) {
    console.error("notifySmsStop:", e instanceof Error ? e.message : e);
  }
}
