// Lese-spørringer mot de SYNKEDE Tripletex-tabellene (0071). Disse kjører på
// server (admin-/revisor-sider) med den innloggede brukerens klient, så RLS
// avgjør tilgang. Defensivt: hver funksjon svarer med tomt/null ved feil
// (samme mønster som report-queries.ts), så en side aldri krasjer på manglende
// synk eller tilgang.

import { createClient } from "@/lib/supabase/server";
import {
  buildResultatSummary,
  type ResultRow,
  type ResultatSummary,
} from "./report";
import type { TxBalanceRow } from "./read";

/** Rad slik den ligger i tripletex_balance. */
export type BalanceRow = {
  account_number: string;
  account_name: string | null;
  account_type: string | null;
  balance_in: number | null;
  balance_change: number | null;
  balance_out: number | null;
};

/** Map en lagret balanse-rad tilbake til TxBalanceRow for report-helperne. */
function toTxRow(r: BalanceRow): TxBalanceRow {
  return {
    account: {
      number: r.account_number,
      name: r.account_name ?? undefined,
      type: r.account_type ?? undefined,
    },
    balanceIn: r.balance_in ?? undefined,
    balanceChange: r.balance_change ?? undefined,
    balanceOut: r.balance_out ?? undefined,
  };
}

/**
 * Resultat for en periode (period_key "YYYY-MM" eller "YYYY"), regnet ut med
 * de samme rene helperne som ellers. Tom oppsummering ved feil/ingen data.
 */
export async function getTripletexResultat(periodKey: string): Promise<{
  omsetning: number;
  kostnader: number;
  resultat: number;
  utgaaendeMva: number;
  inngaaendeMva: number;
  rows: ResultRow[];
}> {
  const empty = {
    omsetning: 0,
    kostnader: 0,
    resultat: 0,
    utgaaendeMva: 0,
    inngaaendeMva: 0,
    rows: [] as ResultRow[],
  };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tripletex_balance")
      .select(
        "account_number,account_name,account_type,balance_in,balance_change,balance_out",
      )
      .eq("period_key", periodKey);
    if (error || !data) return empty;
    const summary: ResultatSummary = buildResultatSummary(
      (data as BalanceRow[]).map(toTxRow),
    );
    return {
      omsetning: summary.omsetning,
      kostnader: summary.kostnader,
      resultat: summary.resultat,
      utgaaendeMva: summary.utgaaendeMva,
      inngaaendeMva: summary.inngaaendeMva,
      rows: summary.rows,
    };
  } catch {
    return empty;
  }
}

/** Alle saldobalanse-rader for en periode, sortert på kontonummer. */
export async function getTripletexSaldobalanse(periodKey: string): Promise<
  {
    account_number: string;
    account_name: string | null;
    account_type: string | null;
    balance_in: number | null;
    balance_change: number | null;
    balance_out: number | null;
  }[]
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tripletex_balance")
      .select(
        "account_number,account_name,account_type,balance_in,balance_change,balance_out",
      )
      .eq("period_key", periodKey);
    if (error || !data) return [];
    // Sorter numerisk på kontonummer (lagret som tekst).
    return (data as BalanceRow[]).slice().sort((a, b) => {
      const na = parseInt(a.account_number, 10) || 0;
      const nb = parseInt(b.account_number, 10) || 0;
      return na - nb;
    });
  } catch {
    return [];
  }
}

/** Kontoplanen fra tripletex_account, sortert på kontonummer. */
export async function getTripletexKontoplan(): Promise<
  {
    tripletex_id: number;
    number: string | null;
    name: string | null;
    type: string | null;
    vat_type: unknown;
    ledger_type: string | null;
    is_bank_account: boolean | null;
  }[]
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tripletex_account")
      .select(
        "tripletex_id,number,name,type,vat_type,ledger_type,is_bank_account",
      );
    if (error || !data) return [];
    return data.slice().sort((a, b) => {
      const na = parseInt(a.number ?? "", 10) || 0;
      const nb = parseInt(b.number ?? "", 10) || 0;
      return na - nb;
    });
  } catch {
    return [];
  }
}

/** Bilag fra tripletex_voucher (nyeste først). bookedOnly filtrerer på booked. */
export async function getTripletexVouchers(args?: {
  limit?: number;
  bookedOnly?: boolean;
}): Promise<
  {
    tripletex_id: number;
    number: number | null;
    temp_number: number | null;
    voucher_date: string | null;
    description: string | null;
    voucher_type: string | null;
    booked: boolean | null;
    year: number | null;
  }[]
> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("tripletex_voucher")
      .select(
        "tripletex_id,number,temp_number,voucher_date,description,voucher_type,booked,year",
      )
      .order("voucher_date", { ascending: false, nullsFirst: false })
      .order("number", { ascending: false, nullsFirst: false });
    if (args?.bookedOnly) q = q.eq("booked", true);
    if (args?.limit && args.limit > 0) q = q.limit(args.limit);
    const { data, error } = await q;
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** Siste synk-kjøring (for «sist oppdatert»-indikator). Null ved feil. */
export async function getLastSync(): Promise<{
  finished_at: string | null;
  status: string | null;
} | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tripletex_sync_run")
      .select("finished_at,status")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
