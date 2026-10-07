/* =====================================================================
 * FORSIDE-SEKSJONER – ren konfig (trygg å importere både klient og server).
 *   Selve DB-oppslaget ligger i site-sections.ts (kun server).
 * ===================================================================== */

export type SectionKey =
  | "team"
  | "tjenester"
  | "handverket"
  | "galleri"
  | "anmeldelser"
  | "about"
  | "banner"
  | "cta"
  | "apningstider";

/** Seksjonene i rekkefølge, med etikett til admin og evt. navbar-lenke. */
export const SITE_SECTIONS: { key: SectionKey; label: string; nav?: string }[] = [
  { key: "team", label: "Teamet", nav: "/#team" },
  { key: "tjenester", label: "Prisliste / tjenester", nav: "/#tjenester" },
  { key: "handverket", label: "Håndverket", nav: "/#handverket" },
  { key: "galleri", label: "Galleri", nav: "/#galleri" },
  { key: "anmeldelser", label: "Anmeldelser (Google)" },
  { key: "about", label: "Om oss" },
  { key: "banner", label: "Neon-banner" },
  { key: "cta", label: "«Bestill time»-banner" },
  { key: "apningstider", label: "Åpningstider & kontakt", nav: "/#kontakt" },
];

export type SectionFlags = Record<string, boolean>;

/** En seksjon er synlig med mindre den er eksplisitt skrudd av. */
export function sectionOn(flags: SectionFlags, key: SectionKey): boolean {
  return flags[key] !== false;
}
