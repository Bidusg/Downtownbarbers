import { createServiceClient } from "@/lib/supabase/service";
import { getSiteSettings } from "@/lib/site-settings";
import { sendSms } from "@/lib/sms";
import { getSmsTemplates, renderSms } from "@/lib/sms-templates";
import { staffDisplayName } from "@/lib/staff-display";
import { translateServiceText, type Lang } from "@/lib/i18n/server-lang";

/** Felles verdier for {adresse} og {telefon} (fra nettside-innstillingene). */
export async function salonSmsVars(): Promise<{ adresse: string; telefon: string }> {
  try {
    const s = await getSiteSettings();
    return { adresse: s.address ?? "", telefon: s.phone ?? "" };
  } catch {
    return { adresse: "", telefon: "" };
  }
}

/** «fredag 24. oktober» / «14:30» i norsk tid. */
export function smsDate(iso: string, lang: Lang = "no"): string {
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
export function smsTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nb-NO", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Bekreftelses-SMS rett etter booking (tekst fra admin → Integrasjoner →
 * SMS-tekster). Hopper stille over hvis SMS ikke er satt opp, er slått av,
 * eller kunden mangler nummer. Kaster aldri – en booking skal ikke velte.
 */
export async function sendBookingConfirmationSms(o: {
  phone: string | null | undefined;
  name: string;
  service: string;
  durationMin?: number | null;
  barber: string;
  startIso: string;
  bookingId?: string | null;
  /** Kundens språk – engelsk mal når kunden booket på engelsk. */
  lang?: Lang;
}): Promise<boolean> {
  try {
    if (!o.phone?.trim()) return false;
    if (new Date(o.startIso).getTime() < Date.now()) return false; // etterregistrering
    const sb = createServiceClient();
    const tpl = await getSmsTemplates(sb);
    if (!tpl.confirmationEnabled) return false;
    const salon = await salonSmsVars();
    const en = o.lang === "en";
    const text = renderSms(en ? tpl.confirmationEn : tpl.confirmation, {
      fornavn: o.name.trim().split(/\s+/)[0] ?? "",
      navn: o.name.trim(),
      tjeneste: await translateServiceText(o.service, o.lang ?? "no"),
      varighet: o.durationMin ? `${o.durationMin}'` : "",
      barber: await staffDisplayName(o.barber),
      dato: smsDate(o.startIso, o.lang),
      tid: smsTime(o.startIso),
      ...salon,
    });
    return await sendSms(o.phone, text, { kind: "bekreftelse", bookingId: o.bookingId ?? null });
  } catch {
    return false;
  }
}
