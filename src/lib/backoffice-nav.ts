// Navigasjonsmodeller for det delte back-office-skallet (Topbar).
// Admin gjenbruker den eksisterende grupperte admin-navigasjonen; de øvrige
// rollene er flate lenkerader.

import type { BoNav } from "@/components/backoffice/Topbar";
import { adminDashboard, adminGroups } from "@/lib/admin-nav";

export const adminNav: BoNav = {
  kind: "grouped",
  dashboard: { ...adminDashboard, exact: true },
  groups: adminGroups,
};

export const revisorNav: BoNav = {
  kind: "flat",
  links: [
    { href: "/revisor", label: "Oversikt", exact: true },
    { href: "/revisor/omsetning", label: "Omsetning" },
    { href: "/revisor/rapport", label: "Perioderapport" },
    { href: "/revisor/lonnslipper", label: "Lønnsslipper" },
    { href: "/revisor/eksport", label: "Eksport (CSV)" },
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

export const kasseNav: BoNav = {
  kind: "flat",
  links: [
    { href: "/kasse", label: "Dashboard", exact: true },
    { href: "/kasse/kalender", label: "Kalender" },
    { href: "/kasse/kunder", label: "Kunder" },
    { href: "/kasse/stempling", label: "Stempling" },
  ],
};
