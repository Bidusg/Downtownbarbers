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

/** Resultat = omsetning - kostnader (positiv = overskudd). */
export function resultat(rows: TxBalanceRow[]): number {
  return round2(omsetning(rows) - kostnader(rows));
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
  /** "INCOME" | "COST" (vår klassifisering, ikke rå Tripletex-type). */
  kind: "INCOME" | "COST";
};

/**
 * Per-konto resultatlinjer (kun inntekts- og kostnadskontoer), snudd til
 * positive beløp og sortert på kontonummer. Til oppstilling/revisjon.
 */
export function resultRows(rows: TxBalanceRow[]): ResultRow[] {
  const out: ResultRow[] = [];
  for (const r of rows) {
    const income = isIncomeRow(r);
    const cost = isCostRow(r);
    if (!income && !cost) continue;
    const change = r.balanceChange ?? 0;
    out.push({
      number: accountNumber(r),
      name: r.account?.name ?? "",
      type: r.account?.type ?? "",
      amount: round2(income ? -change : change),
      kind: income ? "INCOME" : "COST",
    });
  }
  out.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return out;
}

/** Full oppsummering for en periode – pluss de RÅ radene urørt for revisjon. */
export type ResultatSummary = {
  omsetning: number;
  kostnader: number;
  resultat: number;
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
    utgaaendeMva: utgaaendeMva(rows).value,
    inngaaendeMva: inngaaendeMva(rows).value,
    rows: resultRows(rows),
    rawRows: rows,
  };
}
