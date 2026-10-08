// Bygger et daglig bilag (dagsoppgjør) og oppretter det som UBOKFØRT UTKAST
// i Tripletex (sendToLedger=false). Ingenting bokføres automatisk – revisor
// ser over og bokfører selv. Det er et bevisst valg for Downtown Barbers.
//
// Kilden er den samme avledede hovedboka vi allerede regner ut
// (deriveIncomeLedger): debet per betalingsmåte (kundens innbetaling inkl.
// mva) mot kredit salgsinntekt (eks. mva) + utgående mva. Oppstillingen
// balanserer, så sum av posteringene blir 0 – slik Tripletex krever.
//
// Konto refereres i Tripletex med intern id, ikke kontonummer. Vi slår derfor
// opp id-en per kontonummer ved kjøring (ulik i test/prod) og cacher den.

import { deriveIncomeLedger, type VatMode } from "@/lib/accounting";
import { createServiceClient } from "@/lib/supabase/service";
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
  /** Hvilken mva-modell posteringene er bygd etter. */
  vatMode: VatMode;
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
    vatMode: ledger.vatMode,
  };
}

export type PostResult =
  | { status: "skipped"; reason: string; plan: DailyVoucherPlan }
  | { status: "already_posted"; voucherId: number | null; plan: DailyVoucherPlan }
  | { status: "dry_run"; plan: DailyVoucherPlan; body: unknown }
  | {
      status: "draft_created";
      voucherId: number;
      /** Alltid true: bilaget er et ubokført utkast, ikke bokført. */
      draft: true;
      plan: DailyVoucherPlan;
    };

/**
 * Duplikatsperre: har vi allerede postet et ekte dagsbilag for denne datoen?
 * Kun ekte posteringer logges (0053), så en dato som bare er dry-run-kjørt blir
 * IKKE blokkert. Feiler loggen (mangler service-nøkkel e.l.) lar vi kjøringen
 * gå videre – da er Tripletex' egen validering siste skanse.
 */
async function findPostedVoucher(
  isoDate: string,
): Promise<{ voucherId: number | null } | null> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("tripletex_voucher_log")
      .select("voucher_id")
      .eq("voucher_date", isoDate)
      .maybeSingle();
    if (!data) return null;
    return { voucherId: (data.voucher_id as number | null) ?? null };
  } catch {
    return null;
  }
}

/** Loggfør en ekte postering (idempotent på datoen). */
async function recordPostedVoucher(
  isoDate: string,
  voucherId: number,
  plan: DailyVoucherPlan,
): Promise<void> {
  const amountGross = plan.postings
    .filter((p) => p.amountGross > 0)
    .reduce((s, p) => s + p.amountGross, 0);
  try {
    const sb = createServiceClient();
    await sb
      .from("tripletex_voucher_log")
      .upsert(
        {
          voucher_date: isoDate,
          voucher_id: voucherId,
          amount_gross: amountGross,
          sales_count: plan.count,
        },
        { onConflict: "voucher_date" },
      );
  } catch {
    // Loggskriving er best-effort; posteringen er allerede gjennomført.
  }
}

/**
 * Post (eller dry-run) dagsbilaget for en dato. Poster kun når
 * TRIPLETEX_POSTING_ENABLED=true; ellers bygges bilaget og returneres uten å
 * sende noe (trygt å kjøre før kontoplan er bekreftet). Duplikatsperren hindrer
 * at samme dag posteres to ganger.
 */
export async function postDailyVoucher(isoDate: string): Promise<PostResult> {
  const plan = await buildDailyVoucherPlan(isoDate);
  // Hopp bare over når det IKKE finnes posteringer. Merk: en dag kan ha 0
  // ordinære salg (plan.count === 0) men likevel ha posteringer fra SALG av
  // gavekort (forskudd: penger inn → gjeld 2900). De skal fortsatt bokføres.
  if (plan.postings.length === 0) {
    return { status: "skipped", reason: "Ingen bilagslinjer denne dagen", plan };
  }

  // Duplikatsperre: allerede postet? (Kun ekte posteringer logges.)
  const already = await findPostedVoucher(isoDate);
  if (already) {
    return { status: "already_posted", voucherId: already.voucherId, plan };
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

  // VIKTIG: sendToLedger=false → bilaget opprettes som UBOKFØRT UTKAST i
  // Tripletex. Ingenting bokføres automatisk – revisor ser over og bokfører
  // selv. Dette er et bevisst valg (Downtown Barbers vil aldri auto-bokføre).
  // Krever «Avansert bilag»-tilgang på API-nøkkelen.
  const created = await tripletexFetch<{ value?: { id?: number } }>(
    "/ledger/voucher?sendToLedger=false",
    { method: "POST", body: JSON.stringify(body) },
  );
  const voucherId = created?.value?.id;
  if (!voucherId) throw new Error("Tripletex ga ikke noe bilags-id tilbake.");
  await recordPostedVoucher(isoDate, voucherId, plan);
  return { status: "draft_created", voucherId, draft: true, plan };
}
