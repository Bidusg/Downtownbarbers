// Delt kilde for admin-navigasjonen. Brukes av både AdminNav (desktop-dropdowns
// + mobil-accordion) og CommandPalette (Cmd/Ctrl+K-søk). Endre lenker/grupper
// her – ett sted – så følger både nav og palett med.

export type AdminNavItem = {
  label: string;
  href: string;
  /** Kort undertekst for å skille lignende navn (vises i dropdown + palett). */
  description?: string;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const adminDashboard: AdminNavItem = {
  label: "Dashboard",
  href: "/admin",
};

export const adminGroups: AdminNavGroup[] = [
  {
    label: "Drift",
    items: [
      { label: "Bookinger", href: "/admin/bookinger" },
      { label: "Kasseoppgjør", href: "/admin/kasseoppgjor" },
      { label: "Meldinger", href: "/admin/meldinger" },
    ],
  },
  {
    label: "Ansatte",
    items: [
      { label: "Ansatte", href: "/admin/ansatte" },
      {
        label: "Ansattdokumenter",
        href: "/admin/ansattdokumenter",
        description: "Kontrakter og vedlegg per ansatt",
      },
      { label: "Timelister", href: "/admin/timelister" },
      { label: "Fravær", href: "/admin/fravaer" },
      { label: "Lønn", href: "/admin/lonn" },
      { label: "Brukere", href: "/admin/brukere" },
    ],
  },
  {
    label: "Butikk & lager",
    items: [
      { label: "Tjenester", href: "/admin/tjenester" },
      {
        label: "Nivåer & prising",
        href: "/admin/nivaer",
        description: "Pris per nivå × tjeneste",
      },
      { label: "Produkter", href: "/admin/produkter" },
      { label: "Lager", href: "/admin/lager" },
      { label: "Gavekort", href: "/admin/gavekort" },
      {
        label: "Shop-innstillinger",
        href: "/admin/shop-innstillinger",
        description: "Av/på-brytere for kassa",
      },
    ],
  },
  {
    label: "Kunder & marked",
    items: [
      { label: "Kunder", href: "/admin/kunder" },
      { label: "Kundeklubb", href: "/admin/kundeklubb" },
      {
        label: "Kuponger",
        href: "/admin/kuponger",
        description: "Sesong-kuponger til medlemmer",
      },
      { label: "Oppfølging", href: "/admin/oppfolging" },
      {
        label: "Markedsføring",
        href: "/admin/markedsforing",
        description: "Segmenter, e-post/SMS, samtykke",
      },
    ],
  },
  {
    label: "Økonomi",
    items: [
      {
        label: "Nøkkeltall",
        href: "/admin/nokkeltall",
        description: "KPI-er og trender",
      },
      {
        label: "Rapporter",
        href: "/admin/rapporter",
        description: "Eksport og grunndata",
      },
      {
        label: "Produktivitet",
        href: "/admin/rapporter/produktivitet",
        description: "Per barber, no-show, turnus",
      },
      {
        label: "Omsetning",
        href: "/admin/omsetning",
        description: "Salg per periode",
      },
      {
        label: "Måloppnåelse",
        href: "/admin/maloppnaelse",
        description: "Faktisk mot mål",
      },
      {
        label: "Budsjett",
        href: "/admin/budsjett",
        description: "Planlagte tall",
      },
      {
        label: "Regnskap",
        href: "/admin/regnskap",
        description: "Bilag og hovedbok",
      },
    ],
  },
  {
    label: "Innhold",
    items: [
      { label: "Rating", href: "/admin/rating" },
      { label: "Nettside", href: "/admin/nettside" },
      { label: "Integrasjoner", href: "/admin/integrasjoner" },
      { label: "Go-live", href: "/admin/go-live" },
      { label: "Dokumenter", href: "/admin/dokumenter" },
    ],
  },
];

export type AdminPage = AdminNavItem & { group: string };

/** Flat liste over alle admin-sider (Dashboard + alle gruppe-lenker). */
export const adminPages: AdminPage[] = [
  { ...adminDashboard, group: "Generelt" },
  ...adminGroups.flatMap((g) =>
    g.items.map((it) => ({ ...it, group: g.label })),
  ),
];

/** Aktiv-markering: Dashboard er eksakt, øvrige matcher prefiks. */
export function isAdminNavActive(href: string, pathname: string): boolean {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(href + "/");
}
