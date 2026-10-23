import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "./dictionary";
import { translateContent } from "./content-map";
import { getDbContentEn } from "@/lib/content-en";

/* =====================================================================
 * SPRÅK PÅ SERVEREN (e-post, SMS og PDF til kunder)
 *   • getRequestLang(): språket kunden har valgt på nettsiden (cookien
 *     «dtb_lang» som LanguageProvider setter).
 *   • customerLang / bookingCustomerLang: språket som er lagret på kunden
 *     (customers.lang, settes når kunden booker). Brukes når kassa eller
 *     påminnelses-jobben sender noe – da finnes ingen kunde-cookie.
 *   Alt faller stille tilbake til norsk (også før SQL-en er kjørt).
 * ===================================================================== */

export type { Lang };

export function normLang(v: unknown): Lang {
  return v === "en" ? "en" : "no";
}

export async function getRequestLang(): Promise<Lang> {
  try {
    return normLang((await cookies()).get("dtb_lang")?.value);
  } catch {
    return "no";
  }
}

export async function customerLang(
  sb: SupabaseClient,
  customerId: string | null | undefined,
): Promise<Lang> {
  if (!customerId) return "no";
  try {
    const { data, error } = await sb.from("customers").select("lang").eq("id", customerId).maybeSingle();
    if (error) return "no";
    return normLang((data as { lang?: string | null } | null)?.lang);
  } catch {
    return "no";
  }
}

export async function bookingCustomerLang(
  sb: SupabaseClient,
  bookingId: string | null | undefined,
): Promise<Lang> {
  if (!bookingId) return "no";
  try {
    const { data, error } = await sb.from("bookings").select("customer_id").eq("id", bookingId).maybeSingle();
    if (error) return "no";
    return customerLang(sb, (data as { customer_id?: string | null } | null)?.customer_id);
  } catch {
    return "no";
  }
}

/** Språk for mange bookinger på én gang (påminnelses-jobben). */
export async function bookingLangs(
  sb: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, Lang>> {
  const out = new Map<string, Lang>();
  if (!bookingIds.length) return out;
  try {
    const { data, error } = await sb.from("bookings").select("id, customers(lang)").in("id", bookingIds);
    if (error) return out;
    for (const r of (data ?? []) as { id: string; customers: { lang?: string | null } | null }[]) {
      out.set(r.id, normLang(r.customers?.lang));
    }
  } catch {
    /* norsk for alle */
  }
  return out;
}

const LOCALE: Record<Lang, string> = { no: "nb-NO", en: "en-GB" };

/** «fredag 24. oktober» / «Friday 24 October» i norsk tid. */
export function fmtDayLang(iso: string, lang: Lang, withYear = false): string {
  try {
    return new Date(iso).toLocaleDateString(LOCALE[lang], {
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
    });
  } catch {
    return iso;
  }
}

export function fmtClockLang(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Oversett tjeneste-tekst til engelsk (engelske felt fra admin → DeepL →
 * fast liste). Tåler sammensatte tekster som «Herreklipp + Voks · Skjegg».
 */
let cache: { at: number; map: Record<string, string> } | null = null;
async function servicesEn(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.map;
  const map = (await getDbContentEn()).services ?? {};
  cache = { at: Date.now(), map };
  return map;
}

export async function translateServiceText(text: string, lang: Lang): Promise<string> {
  if (lang !== "en" || !text) return text;
  try {
    const extra = await servicesEn();
    const one = (s: string) => {
      const t = s.trim();
      return t ? s.replace(t, translateContent("services", t, "en", extra)) : s;
    };
    return text
      .split(" · ")
      .map((part) => part.split(" + ").map(one).join(" + "))
      .join(" · ");
  } catch {
    return text;
  }
}

/** Betalingsmåter på kvitteringen. */
export function payMethodLang(m: string, lang: Lang): string {
  if (lang !== "en") return m;
  const map: Record<string, string> = {
    kontant: "Cash",
    kort: "Card",
    gavekort: "Gift card",
    klippekort: "Punch card",
    faktura: "Invoice",
    vipps: "Vipps",
  };
  return map[m.trim().toLowerCase()] ?? m;
}

/** Språk for en kunde slått opp på e-post (hurtigsalg uten booking). */
export async function customerLangByEmail(
  sb: SupabaseClient,
  email: string | null | undefined,
): Promise<Lang> {
  const e = email?.trim();
  if (!e) return "no";
  try {
    const { data, error } = await sb
      .from("customers")
      .select("lang")
      .ilike("email", e)
      .not("lang", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) return "no";
    return normLang((data as { lang?: string | null } | null)?.lang);
  } catch {
    return "no";
  }
}
