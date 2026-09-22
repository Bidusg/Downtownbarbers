// Bygger og poster et daglig bilag (dagsoppgjør) til Tripletex.
//
// Kilden er den samme avledede hovedboka vi allerede regner ut
// (deriveIncomeLedger): debet per betalingsmåte (kundens innbetaling inkl.
// mva) mot kredit salgsinntekt (eks. mva) + utgående mva. Oppstillingen
// balanserer, så sum av posteringene blir 0 – slik Tripletex krever.
//
// Konto refereres i Tripletex med intern id, ikke kontonummer. Vi slår derfor
// opp id-en per kontonummer ved kjøring (ulik i test/prod) og cacher den.

import { deriveIncomeLedger } from "@/lib/accounting";
import { TRIPLETEX } from "./config";
import { tripletexFetch } from "./client";

/** UTC-midnatt-døgn for en yyyy-mm-dd (samme «dag» som resten av salgstallene). */
function dayBounds(isoDate: string): { start: string; end: string } {
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const accountIdCache = new Map<string, number>();

/** Slå opp Tripletex intern konto-id for et kontonummer (f.eks. "3000"). */
async function resolveAccountId(number: string): Promise<number> {
  const cached = accountIdCache.get(number);
  if (cached) return cached;
  const json = await tripletexFetch<{ values?: { id: number }[] }>(
    `/ledger/account?number=${encodeURIComponent(number)}&count=1&fields=id,number`,
  );
  const id = json?.values?.[0]?.id;
  if (!id) {
    throw new Error(`Fant ikke Tripletex-konto for kontonummer ${number}.`);
  }
  accountIdCache.set(number, id);
  return id;
}

export type VoucherPosting = {
  row: number;
  date: string;
  /** Kontonummer i vår kontoplan (løses til Tripletex-id ved posting). */
  accountNumber: string;
  accountName: string;
  /** Positiv = debet, negativ = kredit. */
  amountGross: number;
};

export type DailyVoucherPlan = {
  date: string;
  description: string;
  postings: VoucherPosting[];
  /** Antall salg som ligger til grunn. */
  count: number;
  balanced: boolean;
};

/** Bygg bilagsplanen for en dato (uten å kontakte Tripletex). */
export async function buildDailyVoucherPlan(
  isoDate: string,
): Promise<DailyVoucherPlan> {
  const { start, end } = dayBounds(isoDate);
  const ledger = await deriveIncomeLedger(start, end);
  const postings: VoucherPosting[] = ledger.lines
    .map((l, i) => ({
      row: i + 1,
      date: isoDate,
      accountNumber: l.account,
      accountName: l.name,
      amountGross: Math.round(l.debit - l.credit),
    }))
    .filter((p) => p.amountGross !== 0)
    .map((p, i) => ({ ...p, row: i + 1 }));

  return {
    date: isoDate,
    description: `Dagsoppgjør Downtown Barbers ${isoDate}`,
    postings,
    count: ledger.count,
    balanced: ledger.balanced,
  };
}

export type PostResult =
  | { status: "skipped"; reason: string; plan: DailyVoucherPlan }
  | { status: "dry_run"; plan: DailyVoucherPlan; body: unknown }
  | { status: "posted"; voucherId: number; plan: DailyVoucherPlan };

/**
 * Post (eller dry-run) dagsbilaget for en dato. Poster kun når
 * TRIPLETEX_POSTING_ENABLED=true; ellers bygges bilaget og returneres uten å
 * sende noe (trygt å kjøre før kontoplan er bekreftet).
 */
export async function postDailyVoucher(isoDate: string): Promise<PostResult> {
  const plan = await buildDailyVoucherPlan(isoDate);
  if (plan.count === 0 || plan.postings.length === 0) {
    return { status: "skipped", reason: "Ingen salg denne dagen", plan };
  }

  // Løs opp konto-id-er og bygg Tripletex-bilagskropp.
  const postings = [];
  for (const p of plan.postings) {
    const accountId = await resolveAccountId(p.accountNumber);
    postings.push({
      row: p.row,
      date: p.date,
      account: { id: accountId },
      amountGross: p.amountGross,
    });
  }
  const body = {
    date: isoDate,
    description: plan.description,
    postings,
  };

  if (!TRIPLETEX.postingEnabled) {
    return { status: "dry_run", plan, body };
  }

  const created = await tripletexFetch<{ value?: { id?: number } }>(
    "/ledger/voucher",
    { method: "POST", body: JSON.stringify(body) },
  );
  const voucherId = created?.value?.id;
  if (!voucherId) throw new Error("Tripletex ga ikke noe bilags-id tilbake.");
  return { status: "posted", voucherId, plan };
}
