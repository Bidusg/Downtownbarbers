/**
 * Felles dokumenter for alle ansatte (personalhåndbok, rutiner …).
 * Filene ligger i /private/dokumenter (ikke offentlig) og serveres via
 * /api/dokumenter/[slug] bare til innloggede ansatte, kasse og ledelse.
 * Ny versjon: bytt PDF-en og oppdater «updated» og «version».
 */
export type CompanyDoc = {
  slug: string;
  title: string;
  description: string;
  file: string;
  version: string;
  updated: string;
};

export const COMPANY_DOCS: CompanyDoc[] = [
  {
    slug: "personalhandbok",
    title: "Personalhåndbok",
    description: "Rutiner, HMS, kasse, fravær og varsling. Alle ansatte skal ha lest og signert den.",
    file: "personalhandbok.pdf",
    version: "1.0",
    updated: "1. november 2026",
  },
];

export const companyDocUrl = (slug: string, download = false) =>
  `/api/dokumenter/${slug}${download ? "?last-ned=1" : ""}`;
