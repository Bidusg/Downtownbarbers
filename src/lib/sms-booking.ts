import { createServiceClient } from "@/lib/supabase/service";
import { getSiteSettings } from "@/lib/site-settings";
import { sendSms } from "@/lib/sms";
import { getSmsTemplates, renderSms } from "@/lib/sms-templates";

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
export function smsDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", {
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
}): Promise<boolean> {
  try {
    if (!o.phone?.trim()) return false;
    if (new Date(o.startIso).getTime() < Date.now()) return false; // etterregistrering
    const sb = createServiceClient();
    const tpl = await getSmsTemplates(sb);
    if (!tpl.confirmationEnabled) return false;
    const salon = await salonSmsVars();
    const text = renderSms(tpl.confirmation, {
      fornavn: o.name.trim().split(/\s+/)[0] ?? "",
      navn: o.name.trim(),
      tjeneste: o.service,
      varighet: o.durationMin ? `${o.durationMin}'` : "",
      barber: o.barber,
      dato: smsDate(o.startIso),
      tid: smsTime(o.startIso),
      ...salon,
    });
    return await sendSms(o.phone, text);
  } catch {
    return false;
  }
}
