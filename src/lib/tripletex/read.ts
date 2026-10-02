// Lese-lag mot Tripletex: henter regnskapsdata (kontoplan, saldobalanse,
// hovedbok/posteringer, bilag, mva-typer). Bruker samme autentiserte klient
// som posteringen (tripletexFetch). Reading krever KUN lesetilgang på
// API-nøkkelen – ikke TRIPLETEX_POSTING_ENABLED (den styrer bare skriving).
//
// Fase 1: generiske hente-helpere + en diagnostikk som henter ÉN/FÅ rader rå,
// slik at vi kan bekrefte de eksakte feltnavnene mot ekte Tripletex-data før vi
// bygger synken (regnskapstall skal aldri gjettes).

import { tripletexFetch } from "./client";

/** Standard list-svar fra Tripletex ({ fullResultSize, from, count, values }). */
export type TxListResponse<T = unknown> = {
  fullResultSize?: number;
  from?: number;
  count?: number;
  values?: T[];
};

/* ---------- Dato-helpere (Oslo) ---------- */

export function osloToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

/** Første dag i måneden for en yyyy-mm-dd. */
export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Første dag i året for en yyyy-mm-dd. */
export function yearStart(isoDate: string): string {
  return `${isoDate.slice(0, 4)}-01-01`;
}

/**
 * Hent ALLE rader for et list-endepunkt ved å løpe from/count til
 * fullResultSize er tømt. `basePath` kan allerede inneholde query-parametre.
 */
export async function txGetAll<T = unknown>(
  basePath: string,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Sikkerhetstak: maks 100 sider (100k rader) så vi ikke looper i det uendelige.
  for (let guard = 0; guard < 100; guard++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const page = await tripletexFetch<TxListResponse<T>>(
      `${basePath}${sep}from=${from}&count=${pageSize}`,
    );
    const vals = page?.values ?? [];
    out.push(...vals);
    const total = page?.fullResultSize ?? out.length;
    from += vals.length;
    if (vals.length === 0 || out.length >= total) break;
  }
  return out;
}

/* ---------- Diagnostikk (Fase 1) ----------
 * Henter små rå-utsnitt fra de aktuelle regnskaps-endepunktene, slik at vi kan
 * lese de FAKTISKE feltnavnene (særlig /balanceSheet-radene) før vi bygger
 * synken. Oppretter/endrer ingenting. */

export type ProbeSample =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type TripletexProbe = {
  dateFrom: string;
  dateTo: string;
  account: ProbeSample;
  balanceSheet: ProbeSample;
  posting: ProbeSample;
  voucher: ProbeSample;
  vatType: ProbeSample;
};

async function sample(path: string): Promise<ProbeSample> {
  try {
    return { ok: true, data: await tripletexFetch(path) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Diagnostikk: hent få rader fra hvert regnskaps-endepunkt så vi ser den
 * eksakte dataformen. `fields=*` + ekspandering av under-objekter gir oss alle
 * feltnavn. Vinduet er år-til-dato som standard.
 */
export async function probeFinancialData(
  dateFrom?: string,
  dateTo?: string,
): Promise<TripletexProbe> {
  const today = osloToday();
  const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : yearStart(today);
  const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : today;

  const [account, balanceSheet, posting, voucher, vatType] = await Promise.all([
    sample(`/ledger/account?count=1&fields=*`),
    sample(`/balanceSheet?dateFrom=${from}&dateTo=${to}&count=3&fields=*,account(*)`),
    sample(
      `/ledger/posting?dateFrom=${from}&dateTo=${to}&count=1&fields=*,account(number,name),voucher(id,number)`,
    ),
    sample(`/ledger/voucher?dateFrom=${from}&dateTo=${to}&count=1&fields=*`),
    sample(`/ledger/vatType?count=1&fields=*`),
  ]);

  return { dateFrom: from, dateTo: to, account, balanceSheet, posting, voucher, vatType };
}
