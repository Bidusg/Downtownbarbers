// Navigasjonsmodeller for det delte back-office-skallet (Topbar).
// Admin gjenbruker den eksisterende grupperte admin-navigasjonen; de øvrige
// rollene er flate lenkerader.

import type { BoLink, BoNav } from "@/components/backoffice/Topbar";
import { adminDashboard, adminGroups } from "@/lib/admin-nav";

export const adminNav: BoNav = {
  kind: "grouped",
  dashboard: { ...adminDashboard, exact: true },
  groups: adminGroups,
};

// Revisor: samme rolige dropdown-meny som admin, med tre grupper.
export const revisorNav: BoNav = {
  kind: "grouped",
  dashboard: { href: "/revisor", label: "Oversikt", exact: true },
  groups: [
    {
      label: "Omsetning",
      items: [
        { href: "/revisor/omsetning", label: "Omsetning", description: "Dag for dag og per barber" },
        { href: "/revisor/rapport", label: "Perioderapport", description: "Kvartal, halvår og helår" },
        { href: "/revisor/kasseoppgjor", label: "Kasseoppgjør", description: "Talt kontant/kort/Vipps og avvik" },
      ],
    },
    {
      label: "Lønn",
      items: [
        { href: "/revisor/lonnslipper", label: "Lønnsoversikt", description: "Generer og send lønnsslipper" },
        { href: "/revisor/ansatte", label: "Lønn per ansatt", description: "Grunnlag og manuelle linjer" },
        { href: "/revisor/arbeidstid", label: "Arbeidstid", description: "Stemplede timer per ansatt" },
      ],
    },
    {
      label: "Regnskap",
      items: [
        { href: "/revisor/saldobalanse", label: "Saldobalanse" },
        { href: "/revisor/bilag", label: "Bilag", description: "Fakturaer og kvitteringer fra salongen" },
        { href: "/revisor/eksport", label: "Eksport (CSV)", description: "Alle salg som regneark" },
      ],
    },
  ],
};

export const ansattNav: BoNav = {
  kind: "flat",
  links: [
    { href: "/ansatt", label: "Min side", exact: true },
    { href: "/ansatt/turnus", label: "Min turnus" },
    { href: "/ansatt/fravaer", label: "Mine fravær" },
    { href: "/ansatt/timer", label: "Mine timer" },
    { href: "/ansatt/dokumenter", label: "Mine dokumenter" },
  ],
};

/**
 * Kassa. `priority` avgjør hvem som blir stående i topp-raden når plassen
 * tar slutt (lavest overlever lengst) – rekkefølgen i raden er uendret.
 *
 * De fire første er det man er innom hele dagen. Krisetimer, nettordrer og
 * kasseoppgjør ligger bakerst med vilje: de har allerede hvert sitt banner
 * øverst på siden når det faktisk venter noe, så de trenger ikke en fast
 * plass i baren for å bli oppdaget.
 */
const kasseLinks: BoLink[] = [
  { href: "/kasse", label: "Oversikt", exact: true, priority: 0 },
  { href: "/kasse/kalender", label: "Kalender", priority: 1 },
  { href: "/kasse/kunder", label: "Kunder", priority: 2 },
  { href: "/kasse/stempling", label: "Stempling", priority: 3 },
  { href: "/kasse/nettordrer", label: "Nettordrer", priority: 4 },
  { href: "/kasse/kasseoppgjor", label: "Kasseoppgjør", short: "Oppgjør", priority: 5 },
  { href: "/kasse/lager", label: "Lager", priority: 6 },
  { href: "/kasse/gavekort", label: "Gavekort", priority: 7 },
  { href: "/kasse/krisetimer", label: "Krisetimer", priority: 8 },
  { href: "/kasse/dokumenter", label: "Dokumenter", priority: 9 },
];

export const kasseNav: BoNav = { kind: "flat", links: kasseLinks };

/**
 * Samme meny, med tellere på det som venter på noen. Havner en av dem i
 * «Mer»-menyen, summeres tellerne på selve Mer-knappen – så man ser at det
 * ligger noe der uten å måtte åpne den.
 */
export function kasseNavWith(counts: {
  crisis?: number;
  webOrders?: number;
  settlements?: number;
}): BoNav {
  const badges: Record<string, number | undefined> = {
    "/kasse/krisetimer": counts.crisis,
    "/kasse/nettordrer": counts.webOrders,
    "/kasse/kasseoppgjor": counts.settlements,
  };
  return {
    kind: "flat",
    links: kasseLinks.map((l) => (badges[l.href] ? { ...l, badge: badges[l.href] } : l)),
  };
}
