/**
 * Felles dokumenter for alle ansatte (personalhåndbok, rutiner …).
 * Filene ligger i /private/dokumenter (ikke offentlig) og serveres via
 * /api/dokumenter/[slug] bare til innloggede ansatte, kasse og ledelse.
 * Ny versjon: bytt PDF-ene og oppdater «updated» og «version».
 */
export type DocLang = "no" | "en";

export type CompanyDoc = {
  slug: string;
  title: string;
  titleEn: string;
  description: string;
  /** Én fil per språk. Den norske er den gjeldende teksten. */
  files: Partial<Record<DocLang, string>>;
  version: string;
  updated: string;
};

export const COMPANY_DOCS: CompanyDoc[] = [
  {
    slug: "personalhandbok",
    title: "Personalhåndbok",
    titleEn: "Staff Handbook",
    description: "Rutiner, HMS, kasse, fravær og varsling. Alle ansatte skal ha lest og signert den.",
    files: { no: "personalhandbok.pdf", en: "staff-handbook.pdf" },
    version: "1.0",
    updated: "1. november 2026",
  },
];

export const companyDocUrl = (slug: string, lang: DocLang = "no", download = false) => {
  const q = new URLSearchParams();
  if (lang === "en") q.set("lang", "en");
  if (download) q.set("last-ned", "1");
  const s = q.toString();
  return `/api/dokumenter/${slug}${s ? `?${s}` : ""}`;
};
