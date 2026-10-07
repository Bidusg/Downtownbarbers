/* =====================================================================
 * REDIGERBARE TEKSTER – ren konfig (trygg å importere klient + server).
 *   Kuratert liste over faste tekster eieren kan endre fra admin, gruppert
 *   per seksjon. Nøklene peker til ordboken (dictionary.ts); overstyring
 *   lagres i site_texts og vinner over ordboken (med ordboken som fallback).
 * ===================================================================== */

export type TextOverrides = Record<string, { no?: string; en?: string }>;

export type TextGroup = {
  group: string;
  items: { key: string; label: string }[];
};

export const EDITABLE_TEXTS: TextGroup[] = [
  {
    group: "Meny (navbar)",
    items: [
      { key: "nav.team", label: "Teamet" },
      { key: "nav.tjenester", label: "Tjenester" },
      { key: "nav.handverket", label: "Håndverket" },
      { key: "nav.galleri", label: "Galleri" },
      { key: "nav.butikk", label: "Butikk" },
      { key: "nav.kontakt", label: "Kontakt" },
    ],
  },
  {
    group: "Hero (øverst)",
    items: [
      { key: "home.hero.reviews", label: "Anmeldelser-tekst" },
      { key: "home.hero.since", label: "«Siden»-tekst" },
    ],
  },
  {
    group: "Teamet",
    items: [
      { key: "home.team.eyebrow", label: "Liten overskrift" },
      { key: "home.team.title", label: "Overskrift" },
      { key: "home.team.book", label: "«Book nå»-knapp" },
    ],
  },
  {
    group: "Prisliste / tjenester",
    items: [
      { key: "home.services.eyebrow", label: "Liten overskrift" },
      { key: "home.services.title", label: "Overskrift" },
    ],
  },
  {
    group: "Håndverket",
    items: [
      { key: "home.craft.eyebrow", label: "Liten overskrift" },
      { key: "home.craft.title", label: "Overskrift" },
    ],
  },
  {
    group: "Galleri",
    items: [
      { key: "home.gallery.eyebrow", label: "Liten overskrift" },
      { key: "home.gallery.title", label: "Overskrift" },
    ],
  },
  {
    group: "Om oss",
    items: [
      { key: "home.about.eyebrow", label: "Liten overskrift" },
      { key: "home.about.cta", label: "Lenketekst" },
    ],
  },
  {
    group: "Anmeldelser",
    items: [
      { key: "reviews.title", label: "Overskrift" },
      { key: "reviews.seeAll", label: "«Se alle på Google»" },
      { key: "reviews.seeAllTa", label: "«Se alle på Tripadvisor»" },
    ],
  },
  {
    group: "Åpningstider & kontakt",
    items: [
      { key: "home.hours.eyebrow", label: "Åpningstider – overskrift" },
      { key: "home.contact.eyebrow", label: "Kontakt – overskrift" },
    ],
  },
  {
    group: "«Bestill time»-banner",
    items: [{ key: "home.cta.button", label: "Knappetekst" }],
  },
  {
    group: "Booking-side",
    items: [
      { key: "booking.eyebrow", label: "Liten overskrift" },
      { key: "booking.heading", label: "Overskrift" },
      { key: "booking.intro", label: "Ingress" },
    ],
  },
];
