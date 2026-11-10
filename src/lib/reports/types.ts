import type { Range } from "@/lib/report-queries";
import type { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * RAPPORTSENTER – felles kontrakt.
 *   Hver rapportmodul (src/lib/reports/<område>.ts) returnerer REN DATA
 *   (ReportSheet[]). Selve utseendet i Excel lages ett sted:
 *   src/lib/xlsx/report-theme.ts. Da ser alle rapporter like ryddige ut,
 *   og en ny rapport er bare «hent data → fyll inn tabeller».
 * ===================================================================== */

export type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Kolonnetype styrer tallformat i Excel:
 *  - text      fri tekst
 *  - int       heltall (1 234)
 *  - decimal   desimaltall (1 234,5)
 *  - money     kroner uten øre (1 234 kr). Send tall, ikke ferdig formatert tekst.
 *  - money2    kroner med øre (89,50 kr) – for enhetspriser, innkjøpspris, snittpris.
 *  - pct       andel som BRØK (0.25 = 25 %)
 *  - date      "YYYY-MM-DD" (Oslo-dato)
 *  - datetime  ISO-tidspunkt (UTC) – vises i Oslo-tid
 */
export type ColType = "text" | "int" | "decimal" | "money" | "money2" | "pct" | "date" | "datetime";

export type Cell = string | number | null;

export type Column = {
  key: string;
  header: string;
  type: ColType;
  /** Bredde i tegn. Utelatt = beregnes fra innholdet. */
  width?: number;
  /**
   * Sum-rad nederst (Excel-formel, så den regner om ved filtrering/endring).
   *  sum = SUBTOTAL(109), avg = SUBTOTAL(101), count = SUBTOTAL(103). Utelatt = tom.
   */
  total?: "sum" | "avg" | "count";
};

export type Table = {
  /** Overskrift over tabellen (valgfri når arket bare har én tabell). */
  title?: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  /** Kort forklaring under tabellen (kilde, forbehold, hvordan tallet er regnet). */
  note?: string;
};

export type Kpi = {
  label: string;
  value: number | null;
  type: Extract<ColType, "int" | "decimal" | "money" | "money2" | "pct">;
  /** Liten tekst under tallet, f.eks. «eks. mva» eller «forrige periode: 12 300 kr». */
  hint?: string;
};

export type ReportSheet = {
  /** Arknavn: maks 31 tegn, ingen : \ / ? * [ ]. Motoren korter/renser og gjør unikt. */
  name: string;
  title: string;
  subtitle?: string;
  /** Nøkkeltall-fliser øverst på arket. */
  kpis?: Kpi[];
  tables: Table[];
};

export type ReportCategory =
  | "Omsetning"
  | "Barbere"
  | "Kasse"
  | "Kunder"
  | "Booking"
  | "Varer"
  | "Lønn";

export type ReportContext = {
  range: Range;
  sb: Supa;
};

export type ReportDef = {
  /** Unik, url-vennlig nøkkel, f.eks. "omsetning-dag". */
  key: string;
  title: string;
  /** Én setning som vises i rapportsenteret. */
  description: string;
  category: ReportCategory;
  /** false = rapporten bruker ikke perioden (f.eks. varelager nå). Standard true. */
  usesRange?: boolean;
  build: (ctx: ReportContext) => Promise<ReportSheet[]>;
};
