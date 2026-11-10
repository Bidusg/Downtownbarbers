import type { ReportDef } from "@/lib/reports/types";
import { REPORTS as OMSETNING } from "@/lib/reports/omsetning";
import { REPORTS as BARBERE } from "@/lib/reports/barbere";
import { REPORTS as KASSE } from "@/lib/reports/kasse";
import { REPORTS as KUNDER } from "@/lib/reports/kunder";
import { REPORTS as BOOKING } from "@/lib/reports/booking";
import { REPORTS as VARER } from "@/lib/reports/varer";
import { REPORTS as LONN } from "@/lib/reports/lonn";

/* =====================================================================
 * Alle rapporter i rapportsenteret. Ny rapport = legg den til i riktig
 * modul (src/lib/reports/<område>.ts) – den dukker da opp her automatisk.
 * ===================================================================== */

export const ALL_REPORTS: ReportDef[] = [
  ...OMSETNING,
  ...BARBERE,
  ...KASSE,
  ...KUNDER,
  ...BOOKING,
  ...VARER,
  ...LONN,
];

export function findReports(keys: string[]): ReportDef[] {
  const want = new Set(keys);
  return ALL_REPORTS.filter((r) => want.has(r.key));
}

/** Det klienten trenger for å vise lista (uten build-funksjonene). */
export type ReportMeta = Pick<ReportDef, "key" | "title" | "description" | "category" | "usesRange">;

export function reportMeta(): ReportMeta[] {
  return ALL_REPORTS.map(({ key, title, description, category, usesRange }) => ({
    key,
    title,
    description,
    category,
    usesRange: usesRange ?? true,
  }));
}
