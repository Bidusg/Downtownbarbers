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

export const kasseNav: BoNav = {
  kind: "flat",
  links: [
    { href: "/kasse", label: "Dashboard", exact: true },
    { href: "/kasse/kalender", label: "Kalender" },
    { href: "/kasse/kunder", label: "Kunder" },
    { href: "/kasse/krisetimer", label: "Krisetimer" },
    { href: "/kasse/kasseoppgjor", label: "Kasseoppgjør" },
    { href: "/kasse/gavekort", label: "Gavekort" },
    { href: "/kasse/lager", label: "Lager" },
    { href: "/kasse/stempling", label: "Stempling" },
  ],
};
