"use client";

// Dato (og evt. klokkeslett) formatert etter valgt språk – brukes på
// min-side og avbestillingssiden. Alltid i Oslo-tid, uansett hvor kunden er.
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function PortalDate({ iso, withTime = false }: { iso: string; withTime?: boolean }) {
  const { lang } = useLanguage();
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  let out = iso;
  try {
    out = withTime
      ? new Date(iso).toLocaleString(locale, {
          timeZone: "Europe/Oslo",
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date(iso).toLocaleDateString(locale, {
          timeZone: "Europe/Oslo",
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  } catch {
    /* behold iso */
  }
  return <>{out}</>;
}
