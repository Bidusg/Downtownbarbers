// Klient-trygge typer/konstanter for nettside-bilder (ingen server-import).
export type SiteSection = "hero" | "gallery" | "about" | "banner";

export const SECTION_META: { key: SiteSection; title: string; hint: string; single?: boolean }[] = [
  { key: "hero", title: "Hero (øverst på forsiden)", hint: "Karusell – rekkefølgen styrer rotasjonen" },
  { key: "gallery", title: "Galleri («Fra stolen»)", hint: "Vises i to kolonner" },
  { key: "about", title: "«Om oss»-bilde", hint: "Ett bilde – det første aktive brukes", single: true },
  { key: "banner", title: "Banner (neonskiltet)", hint: "Ett bilde – det første aktive brukes", single: true },
];

export type SiteMedia = {
  id: string;
  path: string;
  kind: "image" | "video";
  url: string;
  alt: string | null;
  label: string | null;
  builtin: boolean; // ligger i repoet (/img/…) – kan ikke slettes fra disk
  createdAt: string;
};

export type SiteImage = {
  id: string;
  section: SiteSection;
  kind: "image" | "video";
  url: string;
  alt: string | null;
  sortOrder: number;
  active: boolean;
  mediaId: string | null;
};

export type CraftBlock = {
  id: string;
  imageUrl: string;
  mediaId: string | null;
  title: string;
  body: string | null;
  sortOrder: number;
  active: boolean;
};
