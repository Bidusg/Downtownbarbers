"use server";

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSms } from "@/lib/sms";
import { sendDelayNotice } from "@/lib/email";
import { smsTime } from "@/lib/sms-booking";
import { bookingCustomerLang } from "@/lib/i18n/server-lang";

/** Minuttvalgene i kassa. Alt annet avvises. */
const LATE_MINUTES = [10, 15, 20, 30];

/** Markør i sms_log-teksten, brukt til å se om varsel allerede er sendt. */
const LOG_PREFIX = "Forsinket";

export type LateResult =
  | { ok: true; via: "sms" | "epost"; to: string }
  | { ok: false; error: string; alreadySentAt?: undefined }
  | { ok: false; alreadySentAt: string; error?: undefined };

/**
 * «Forsinket»-knappen i kassa: sender kunden en SMS (eller e-post hvis SMS
 * ikke er satt opp / kunden mangler nummer) om at timen starter X min senere.
 * Endrer ikke selve bookingen. Spør før et nytt varsel hvis det allerede er
 * sendt for denne timen de siste 3 timene (unngår dobbelttrykk).
 */
export async function notifyLate(
  bookingId: string,
  minutes: number,
  opts?: { force?: boolean },
): Promise<LateResult> {
  await requireRole(["shop", "admin"]);
  if (!LATE_MINUTES.includes(minutes)) {
    return { ok: false, error: "Ugyldig antall minutter." };
  }

  const sb = await createClient();
  const { data: b, error } = await sb
    .from("bookings")
    .select("id, start_at, status, customers(full_name, email, phone)")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return { ok: false, error: "Fant ikke timen." };

  const status = String(b.status ?? "");
  if (status === "completed" || status === "cancelled" || status === "no_show") {
    return { ok: false, error: "Timen er allerede avsluttet." };
  }
  const c = (b.customers ?? null) as {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  const phone = c?.phone?.trim() || null;
  const email = c?.email?.trim() || null;
  if (!phone && !email) {
    return { ok: false, error: "Kunden har verken telefon eller e-post." };
  }

  // Allerede varslet nylig? (sms_log er bare lesbar for admin → service-klient.)
  if (!opts?.force) {
    try {
      const svc = createServiceClient();
      const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data: prev } = await svc
        .from("sms_log")
        .select("created_at")
        .eq("booking_id", bookingId)
        .eq("status", "sendt")
        .ilike("body", `${LOG_PREFIX}%`)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = (prev as { created_at: string }[] | null)?.[0];
      if (last) return { ok: false, alreadySentAt: smsTime(last.created_at) };
    } catch {
      /* best-effort – ved feil sendes det heller enn å blokkere */
    }
  }

  const start = String(b.start_at);
  const oldTime = smsTime(start);
  const newTime = smsTime(new Date(new Date(start).getTime() + minutes * 60_000).toISOString());
  const lang = await bookingCustomerLang(sb, bookingId);
  const first = (c?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const en = lang === "en";

  if (phone) {
    const text = en
      ? `Hi${first ? " " + first : ""}! Sorry, we're running about ${minutes} min late today. Your appointment at ${oldTime} will start around ${newTime}. – Downtown Barbers`
      : `Hei${first ? " " + first : ""}! Beklager, vi er ca. ${minutes} min forsinket i dag. Timen din kl. ${oldTime} starter rundt kl. ${newTime}. – Downtown Barbers`;
    const sent = await sendSms(phone, text, {
      kind: "annet",
      bookingId,
      logBody: `${LOG_PREFIX} ${minutes} min: ${text}`,
    });
    if (sent) return { ok: true, via: "sms", to: phone };
  }

  if (email) {
    const sent = await sendDelayNotice({
      to: email,
      name: c?.full_name ?? "",
      minutes,
      oldTime,
      newTime,
      lang,
    });
    if (sent) return { ok: true, via: "epost", to: email };
  }

  return {
    ok: false,
    error: phone
      ? "SMS kunne ikke sendes (sjekk SMS-oppsettet i admin → Integrasjoner)."
      : "E-posten kunne ikke sendes.",
  };
}
