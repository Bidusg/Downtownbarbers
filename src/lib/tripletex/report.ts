// Rapport-helpere: RENE funksjoner over saldobalanse-rader (/balanceSheet).
// Ingen I/O. All omregning av regnskapstall til visning skjer her, slik at
// både sync-laget og page-laget kan gjenbruke nøyaktig samme logikk.
//
// -------------------------------------------------------------------------
// SIGN-KONVENSJON I TRIPLETEX (bekreftet mot ekte data – må ikke endres):
//
//   Tripletex fører etter debet/kredit. `balanceChange` er periodens netto
//   bevegelse på kontoen MED fortegn:
//     * INNTEKTSkontoer (3000–3999, type "INCOME") er KREDIT-kontoer →
//       balanceChange er NEGATIV når det er omsetning.
//     * KOSTNADSkontoer (4000–7999, type "COST") er DEBET-kontoer →
//       balanceChange er POSITIV når det påløper kostnad.
//
//   For å vise «vanlige» positive tall snur vi fortegnet på inntekt:
//     omsetning  =  -sum(balanceChange) over inntektskontoer
//     kostnader  =  +sum(balanceChange) over kostnadskontoer
//     resultat   =  omsetning - kostnader
//
//   Vi klassifiserer PRIMÆRT på account.type, men krysssjekker på
//   kontonummer-intervall (3000–3999 inntekt, 4000–7999 kostnad) fordi
//   `type` i teorien kan mangle/være ukjent. Ukjente typer håndteres
//   grasiøst: de teller verken som inntekt eller kostnad med mindre
//   kontonummeret plasserer dem.
// -------------------------------------------------------------------------

import type { TxBalanceRow } from "./read";

/** Rund til to desimaler (øre) og unngå -0 / flyttalls-støy. */
function round2(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Trekk ut kontonummer som tall (kontoer er 4-sifrede i NS 4102). */
function accountNumber(row: TxBalanceRow): number | null {
  const raw = row.account?.number;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

/** Er dette en inntektskonto? type==="INCOME" ELLER nummer 3000–3999. */
export function isIncomeRow(row: TxBalanceRow): boolean {
  if ((row.account?.type ?? "").toUpperCase() === "INCOME") return true;
  const n = accountNumber(row);
  return n != null && n >= 3000 && n <= 3999;
}

/** Er dette en kostnadskonto? type==="COST" ELLER nummer 4000–7999. */
export function isCostRow(row: TxBalanceRow): boolean {
  if ((row.account?.type ?? "").toUpperCase() === "COST") return true;
  const n = accountNumber(row);
  return n != null && n >= 4000 && n <= 7999;
}

/** Er dette en finansinntekt? nummer 8000–8099 ELLER type==="INVESTMENT_INCOME". */
export function isFinansInntektRow(row: TxBalanceRow): boolean {
  const n = accountNumber(row);
  if (n != null && n >= 8000 && n <= 8099) return true;
  return (row.account?.type ?? "").toUpperCase() === "INVESTMENT_INCOME";
}

/** Er dette en finanskostnad? nummer 8100–8199 ELLER type==="COST_OF_CAPITAL". */
export function isFinansKostnadRow(row: TxBalanceRow): boolean {
  const n = accountNumber(row);
  if (n != null && n >= 8100 && n <= 8199) return true;
  return (row.account?.type ?? "").toUpperCase() === "COST_OF_CAPITAL";
}

/** Omsetning (positiv) = -sum(balanceChange) over inntektskontoer. */
export function omsetning(rows: TxBalanceRow[]): number {
  const sum = rows
    .filter(isIncomeRow)
    .reduce((acc, r) => acc + (r.balanceChange ?? 0), 0);
  return round2(-sum);
}

/** Kostnader (positiv) = sum(balanceChange) over kostnadskontoer. */
export function kostnader(rows: TxBalanceRow[]): number {
  const sum = rows
    .filter(isCostRow)
    .reduce((acc, r) => acc + (r.balanceChange ?? 0), 0);
  return round2(sum);
}

/** Resultat = omsetning - kostnader (positiv = overskudd). Driftsresultat. */
export function resultat(rows: TxBalanceRow[]): number {
  return round2(omsetning(rows) - kostnader(rows));
}

/** Finansinntekter (positiv) = -sum(balanceChange) over finansinntektskontoer (8000–8099). */
export function finansinntekter(rows: TxBalanceRow[]): number {
  const sum = rows
    .filter(isFinansInntektRow)
    .reduce((acc, r) => acc + (r.balanceChange ?? 0), 0);
  return round2(-sum);
}

/** Finanskostnader (positiv) = sum(balanceChange) over finanskostnadskontoer (8100–8199). */
export function finanskostnader(rows: TxBalanceRow[]): number {
  const sum = rows
    .filter(isFinansKostnadRow)
    .reduce((acc, r) => acc + (r.balanceChange ?? 0), 0);
  return round2(sum);
}

/** Netto finans = finansinntekter - finanskostnader. */
export function nettoFinans(rows: TxBalanceRow[]): number {
  return round2(finansinntekter(rows) - finanskostnader(rows));
}

/** Resultat før skatt = driftsresultat + netto finans. */
export function resultatForSkatt(rows: TxBalanceRow[]): number {
  return round2(omsetning(rows) - kostnader(rows) + nettoFinans(rows));
}

/** Finn én rad på kontonummer. */
function rowByNumber(rows: TxBalanceRow[], number: number): TxBalanceRow | null {
  return rows.find((r) => accountNumber(r) === number) ?? null;
}

/**
 * Utgående mva – konto 2700. Vi eksponerer begge fortegn-/periodevarianter:
 *   - change: periodens bevegelse (balanceChange) – mva PÅLØPT i perioden.
 *   - out:    akkumulert saldo ved periodeslutt (balanceOut) – skyldig mva.
 * 2700 er en gjeldskonto (kredit) så rå-tallene er typisk negative; vi snur
 * til positivt for visning. `value` er standardvalget = periodens bevegelse.
 */
export function utgaaendeMva(rows: TxBalanceRow[]): {
  value: number;
  change: number;
  out: number;
} {
  const row = rowByNumber(rows, 2700);
  const change = round2(-(row?.balanceChange ?? 0));
  const out = round2(-(row?.balanceOut ?? 0));
  return { value: change, change, out };
}

/**
 * Inngående mva – konto 2710 (hvis den finnes). Debet-konto; rå-tall typisk
 * positive. Samme periode/akkumulert-oppdeling som utgående.
 */
export function inngaaendeMva(rows: TxBalanceRow[]): {
  value: number;
  change: number;
  out: number;
} {
  const row = rowByNumber(rows, 2710);
  const change = round2(row?.balanceChange ?? 0);
  const out = round2(row?.balanceOut ?? 0);
  return { value: change, change, out };
}

/** Én resultatlinje for visning. amount er snudd til positivt beløp. */
export type ResultRow = {
  number: number | null;
  name: string;
  type: string;
  /** Snudd-til-positivt: inntekt = -balanceChange, kostnad = +balanceChange. */
  amount: number;
  /** "INCOME" | "COST" | "FINANS_INCOME" | "FINANS_COST" (vår klassifisering, ikke rå Tripletex-type). */
  kind: "INCOME" | "COST" | "FINANS_INCOME" | "FINANS_COST";
};

/**
 * Per-konto resultatlinjer (inntekts-, kostnads- og finanskontoer), snudd til
 * positive beløp og sortert på kontonummer. Til oppstilling/revisjon.
 */
export function resultRows(rows: TxBalanceRow[]): ResultRow[] {
  const out: ResultRow[] = [];
  for (const r of rows) {
    const income = isIncomeRow(r);
    const cost = isCostRow(r);
    const finansIncome = isFinansInntektRow(r);
    const finansCost = isFinansKostnadRow(r);
    // Klassifiser kun én gang – intervallene er gjensidig utelukkende.
    const change = r.balanceChange ?? 0;
    if (income) {
      out.push({
        number: accountNumber(r),
        name: r.account?.name ?? "",
        type: r.account?.type ?? "",
        amount: round2(-change),
        kind: "INCOME",
      });
    } else if (cost) {
      out.push({
        number: accountNumber(r),
        name: r.account?.name ?? "",
        type: r.account?.type ?? "",
        amount: round2(change),
        kind: "COST",
      });
    } else if (finansIncome) {
      out.push({
        number: accountNumber(r),
        name: r.account?.name ?? "",
        type: r.account?.type ?? "",
        amount: round2(-change),
        kind: "FINANS_INCOME",
      });
    } else if (finansCost) {
      out.push({
        number: accountNumber(r),
        name: r.account?.name ?? "",
        type: r.account?.type ?? "",
        amount: round2(change),
        kind: "FINANS_COST",
      });
    }
  }
  out.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return out;
}

/** Full oppsummering for en periode – pluss de RÅ radene urørt for revisjon. */
export type ResultatSummary = {
  omsetning: number;
  kostnader: number;
  resultat: number;
  /** Driftsresultat = omsetning - kostnader (= resultat). */
  driftsresultat: number;
  finansinntekter: number;
  finanskostnader: number;
  nettoFinans: number;
  resultatForSkatt: number;
  utgaaendeMva: number;
  inngaaendeMva: number;
  rows: ResultRow[];
  /** Rå balanceSheet-rader uendret – revisjonsspor. */
  rawRows: TxBalanceRow[];
};

/** Bygg hele resultat-oppsummeringen fra saldobalanse-rader. */
export function buildResultatSummary(rows: TxBalanceRow[]): ResultatSummary {
  return {
    omsetning: omsetning(rows),
    kostnader: kostnader(rows),
    resultat: resultat(rows),
    driftsresultat: resultat(rows),
    finansinntekter: finansinntekter(rows),
    finanskostnader: finanskostnader(rows),
    nettoFinans: nettoFinans(rows),
    resultatForSkatt: resultatForSkatt(rows),
    utgaaendeMva: utgaaendeMva(rows).value,
    inngaaendeMva: inngaaendeMva(rows).value,
    rows: resultRows(rows),
    rawRows: rows,
  };
}
