// Synk-lag: henter regnskapsdata fra Tripletex (lese-lag) og speiler den inn
// i Supabase-tabellene fra migrasjon 0071. Skrives av service-rollen som
// omgår RLS. Designet for å kalles fra en cron/route – kaster ALDRI ut av
// seg selv: all feil fanges, logges på tripletex_sync_run, og returneres.
//
// Perioder:
//   * Kontoplan + momstyper: full (alle rader).
//   * Bilag + posteringer: år-til-dato (årets start → i dag).
//   * Saldobalanse: TO vinduer –
//       - inneværende måned, period_key = "YYYY-MM"
//       - år-til-dato,       period_key = "YYYY"
//
// Re-synk av en saldobalanse-periode ERSTATTER radene: vi sletter alt på
// period_key og setter inn på nytt, så fjernede/nullede kontoer ikke blir
// liggende igjen.

import { createServiceClient } from "@/lib/supabase/service";
import { tripletexConfigured } from "./config";
import {
  fetchAccounts,
  fetchBalanceSheet,
  fetchPostings,
  fetchVatTypes,
  fetchVouchers,
  monthStart,
  osloToday,
  yearStart,
  type TxBalanceRow,
} from "./read";

type SyncCounts = {
  accounts: number;
  vatTypes: number;
  vouchers: number;
  postings: number;
  balanceMonth: number;
  balanceYear: number;
};

export type SyncResult =
  | { configured: false }
  | { configured: true; ok: true; counts: SyncCounts }
  | { configured: true; ok: false; error: string };

export type SyncOptions = {
  /** Overstyr «i dag» (yyyy-mm-dd) – primært for testing. */
  today?: string;
};

/** Kontonummer som tekst (tabellene lagrer number som text). */
function numStr(raw: string | number | null | undefined): string {
  return raw == null ? "" : String(raw);
}

/** Bygg balance-rader for en periode til insert. */
function balanceInsertRows(
  rows: TxBalanceRow[],
  periodKey: string,
  dateFrom: string,
  dateTo: string,
) {
  return rows
    .map((r) => ({
      period_key: periodKey,
      account_number: numStr(r.account?.number),
      account_name: r.account?.name ?? null,
      account_type: r.account?.type ?? null,
      balance_in: r.balanceIn ?? null,
      balance_change: r.balanceChange ?? null,
      balance_out: r.balanceOut ?? null,
      date_from: dateFrom,
      date_to: dateTo,
    }))
    // Primærnøkkel krever account_number – dropp rader uten nummer.
    .filter((r) => r.account_number !== "");
}

/**
 * Kjør full synk av regnskapsdata fra Tripletex til Supabase.
 * Returnerer alltid et resultat-objekt; kaster aldri.
 */
export async function syncTripletexFinancials(
  opts?: SyncOptions,
): Promise<SyncResult> {
  // Guard: ikke rør Tripletex hvis vi ikke er konfigurert.
  if (!tripletexConfigured()) {
    return { configured: false };
  }

  const supabase = createServiceClient();
  const today = opts?.today && /^\d{4}-\d{2}-\d{2}$/.test(opts.today)
    ? opts.today
    : osloToday();
  const yStart = yearStart(today);
  const mStart = monthStart(today);
  const monthKey = today.slice(0, 7); // "YYYY-MM"
  const yearKey = today.slice(0, 4); // "YYYY"

  // Åpne en kjøringsrad (status 'running') – id brukes til å lukke den.
  let runId: number | null = null;
  try {
    const { data } = await supabase
      .from("tripletex_sync_run")
      .insert({ status: "running", scope: "full" })
      .select("id")
      .single();
    runId = (data?.id as number) ?? null;
  } catch {
    // Loggraden er ikke kritisk for selve synken – fortsett uansett.
  }

  const finish = async (
    status: string,
    counts: SyncCounts | null,
    error: string | null,
  ) => {
    if (runId == null) return;
    try {
      await supabase
        .from("tripletex_sync_run")
        .update({
          finished_at: new Date().toISOString(),
          status,
          counts: counts ?? undefined,
          error: error ?? undefined,
        })
        .eq("id", runId);
    } catch {
      // ignorér – vi kan ikke gjøre mer her.
    }
  };

  try {
    // ---- Hent alt fra Tripletex (parallelt der det er trygt) ----
    const [accounts, vatTypes, vouchers, postings, balMonth, balYear] =
      await Promise.all([
        fetchAccounts(),
        fetchVatTypes(),
        fetchVouchers(yStart, today),
        fetchPostings(yStart, today),
        fetchBalanceSheet(mStart, today),
        fetchBalanceSheet(yStart, today),
      ]);

    // ---- Kontoplan (upsert på tripletex_id) ----
    if (accounts.length) {
      const rows = accounts.map((a) => ({
        tripletex_id: a.id,
        number: numStr(a.number),
        name: a.name ?? null,
        type: a.type ?? null,
        vat_type: a.vatType ?? null,
        ledger_type: a.ledgerType ?? null,
        is_bank_account: a.isBankAccount ?? null,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("tripletex_account")
        .upsert(rows, { onConflict: "tripletex_id" });
      if (error) throw new Error(`kontoplan: ${error.message}`);
    }

    // ---- Momstyper (upsert på tripletex_id) ----
    if (vatTypes.length) {
      const rows = vatTypes.map((v) => ({
        tripletex_id: v.id,
        name: v.name ?? null,
        percentage: v.percentage ?? null,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("tripletex_vat_type")
        .upsert(rows, { onConflict: "tripletex_id" });
      if (error) throw new Error(`mva-typer: ${error.message}`);
    }

    // ---- Bilag (upsert på tripletex_id, beregn booked) ----
    if (vouchers.length) {
      const rows = vouchers.map((v) => {
        const number = v.number ?? 0;
        const temp = v.tempNumber;
        const booked = number > 0 && (temp === 0 || temp == null);
        return {
          tripletex_id: v.id,
          number: v.number ?? null,
          temp_number: v.tempNumber ?? null,
          voucher_date: v.date ?? null,
          description: v.description ?? null,
          voucher_type: v.voucherType?.name ?? null,
          booked,
          year: v.year ?? null,
          synced_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase
        .from("tripletex_voucher")
        .upsert(rows, { onConflict: "tripletex_id" });
      if (error) throw new Error(`bilag: ${error.message}`);
    }

    // ---- Posteringer (upsert på tripletex_id) ----
    if (postings.length) {
      const rows = postings.map((p) => ({
        tripletex_id: p.id,
        posting_date: p.date ?? null,
        account_number: numStr(p.account?.number),
        account_name: p.account?.name ?? null,
        amount: p.amount ?? null,
        description: p.description ?? null,
        voucher_id: p.voucher?.id ?? null,
        voucher_number: p.voucher?.number ?? null,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("tripletex_posting")
        .upsert(rows, { onConflict: "tripletex_id" });
      if (error) throw new Error(`posteringer: ${error.message}`);
    }

    // ---- Saldobalanse: erstatt hver periode (delete period_key → insert) ----
    for (const [periodKey, from, rows] of [
      [monthKey, mStart, balMonth] as const,
      [yearKey, yStart, balYear] as const,
    ]) {
      const { error: delErr } = await supabase
        .from("tripletex_balance")
        .delete()
        .eq("period_key", periodKey);
      if (delErr) throw new Error(`saldobalanse slett ${periodKey}: ${delErr.message}`);

      const insertRows = balanceInsertRows(rows, periodKey, from, today);
      if (insertRows.length) {
        const { error: insErr } = await supabase
          .from("tripletex_balance")
          .insert(insertRows);
        if (insErr) throw new Error(`saldobalanse ${periodKey}: ${insErr.message}`);
      }
    }

    const counts: SyncCounts = {
      accounts: accounts.length,
      vatTypes: vatTypes.length,
      vouchers: vouchers.length,
      postings: postings.length,
      balanceMonth: balMonth.length,
      balanceYear: balYear.length,
    };

    await finish("ok", counts, null);
    return { configured: true, ok: true, counts };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finish("error", null, error);
    return { configured: true, ok: false, error };
  }
}
