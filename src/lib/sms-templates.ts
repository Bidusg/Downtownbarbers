/**
 * Redigerbare SMS-tekster (admin → Integrasjoner → «SMS-tekster»).
 * Lagres i settings (key = "sms_templates"). Mangler raden, brukes
 * standardteksten – så påminnelser virker uansett.
 *
 * Variabler i teksten byttes ut ved utsending:
 *   {fornavn} {navn} {tjeneste} {varighet} {barber} {dato} {tid} {adresse} {telefon}
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SmsTemplates = {
  /** Bekreftelse rett etter at kunden har booket. */
  confirmation: string;
  /** Send bekreftelses-SMS? (koster én SMS per booking) */
  confirmationEnabled: boolean;
  /** Påminnelse dagen før timen. */
  reminder: string;
};

export const DEFAULT_SMS_TEMPLATES: SmsTemplates = {
  confirmation:
    "Hei {fornavn}, dette er en bekreftelse på at du har booket {tjeneste} {varighet} hos {barber} kl. {tid} den {dato}. Vi gleder oss til å se deg på {adresse}. Trenger du å endre? Ring {telefon}.",
  confirmationEnabled: true,
  reminder:
    "Påminnelse: {tjeneste} hos Downtown Barbers {dato} kl. {tid}. Osterhaus' gate 10. Trenger du å endre? Ring +47 463 58 764.",
};

export const SMS_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: "fornavn", label: "Fornavn", example: "Ola" },
  { key: "navn", label: "Fullt navn", example: "Ola Nordmann" },
  { key: "tjeneste", label: "Behandling", example: "Herreklipp" },
  { key: "varighet", label: "Varighet", example: "30'" },
  { key: "barber", label: "Barber", example: "Kochari" },
  { key: "dato", label: "Dato", example: "fredag 24. oktober" },
  { key: "tid", label: "Klokkeslett", example: "14:30" },
  { key: "adresse", label: "Adresse", example: "Osterhaus' gate 10" },
  { key: "telefon", label: "Telefon", example: "+47 463 58 764" },
];

/** Bytt ut {variabler}. Ukjente variabler står igjen uendret. */
export function renderSms(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Antall SMS-deler meldingen blir delt i (det er det man betaler for).
 * GSM-7 (inkl. æ ø å): 160 tegn, ellers 153 per del. Emoji og andre
 * spesialtegn gjør at hele meldingen sendes som Unicode: 70 / 67.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";
export function smsParts(text: string): { chars: number; parts: number; unicode: boolean } {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const n = [...text].length;
    return { chars: n, parts: n <= 70 ? 1 : Math.ceil(n / 67), unicode };
  }
  return { chars: units, parts: units <= 160 ? 1 : Math.ceil(units / 153), unicode };
}

/** Les malene (admin-klient eller service-klient i cron). */
export async function getSmsTemplates(sb: SupabaseClient): Promise<SmsTemplates> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", "sms_templates").maybeSingle();
    const v = (data?.value ?? {}) as Partial<SmsTemplates>;
    return {
      confirmation: v.confirmation?.trim() || DEFAULT_SMS_TEMPLATES.confirmation,
      confirmationEnabled: v.confirmationEnabled !== false,
      reminder: v.reminder?.trim() || DEFAULT_SMS_TEMPLATES.reminder,
    };
  } catch {
    return DEFAULT_SMS_TEMPLATES;
  }
}
