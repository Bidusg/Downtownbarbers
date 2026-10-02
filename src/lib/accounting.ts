// Regnskapsmodul – Fase 1 (avledet hovedbok, inntektssiden).
//
// Dette er en FORELØPIG, AVLEDET oppstilling: den regner om registrert salg
// til en konto-oppstilling (debet/kredit) etter enkle konteringsregler. Den
// lager IKKE et uforanderlig bilagsspor og er IKKE kvalitetssikret regnskap.
// Kontoplan og mva-koder må bekreftes av regnskapsfører før offisiell bruk.
// Persistente bilag, kostnader og full SAF-T kommer i senere faser
// (se REGNSKAPSMODUL-PLAN.md).

import { PAYROLL } from "@/lib/ops-queries";
import { getPeriodReport } from "@/lib/dashboard-queries";
import { createClient } from "@/lib/supabase/server";

export type LedgerLine = {
  account: string;
  name: string;
  debit: number;
  credit: number;
};

// Kontoplan (inntektssiden) – bekreftet av regnskapsfører Kumar (Alt Innen AS)
// og samstemt med Fixit-kontoplanen for Downtown Barbers:
//   Betaling: 1520 Bankkort (kort), 1521 Vipps, 1522 Gavekort, 1900 Kontanter.
//   Salg:     3001 Behandlinger (tjenester), 3020 Varesalg (varer) – mva-kode 3.
// VIKTIG (Kumar): IKKE bruk 1920, og IKKE post egen mva-konto (2700). Tripletex
// regner mva selv via mva-kode 3 på salgskontoene → vi kjører "account"-modus.
const METHOD_ACCOUNT: Record<string, { account: string; name: string }> = {
  kontant: { account: "1900", name: "Kontanter" },
  cash: { account: "1900", name: "Kontanter" },
  kort: { account: "1520", name: "Bankkort" },
  card: { account: "1520", name: "Bankkort" },
  vipps: { account: "1521", name: "Vipps" },
  gavekort: { account: "1522", name: "Gavekort" },
  giftcard: { account: "1522", name: "Gavekort" },
};
const OTHER_ACCOUNT = { account: "1990", name: "Uspesifisert oppgjør" };

// Salgsinntekt splittes på tjenester (behandlinger) vs. varesalg. Kontonumrene
// følger Fixit-kontoplanen (3001 behandlinger, 3020 varesalg) og kan overstyres
// via env. Uten varelinjer havner alt på behandlings-kontoen, som før splitten.
const SERVICE_SALES_ACCOUNT = {
  account: process.env.TRIPLETEX_ACCOUNT_SERVICE || "3001",
  name: "Behandlinger (avgiftspliktig)",
};
const PRODUCT_SALES_ACCOUNT = {
  account: process.env.TRIPLETEX_ACCOUNT_PRODUCT || "3020",
  name: "Varesalg (avgiftspliktig)",
};
// Kun brukt i "explicit"-modus (ikke Kumars valg). Beholdt som fallback.
const VAT_ACCOUNT = { account: "2700", name: "Utgående mva (25 %)" };

/**
 * Mva-modell for salgs-posteringene:
 *  - "account" (STANDARD, Kumars valg): brutto til salgskonto, INGEN egen
 *    2700-linje. Tripletex regner ut mva selv via kontoens mva-kode (kode 3 =
 *    25 % på 3001/3002/3020). Dette er slik Downtown Barbers skal kjøre.
 *  - "explicit": netto til salgskonto + egen utgående-mva-linje (2700). Kun hvis
 *    salgskontoene IKKE har automatisk mva-kode. Kan tvinges via env.
 * Standard er "account"; env TRIPLETEX_VAT_MODE=explicit overstyrer.
 */
export type VatMode = "explicit" | "account";

export function defaultVatMode(): VatMode {
  return process.env.TRIPLETEX_VAT_MODE === "explicit" ? "explicit" : "account";
}

/** Én rad i kontoplan-oversikten (Fixit-stil visning for revisor/admin). */
export type AccountPlanRow = {
  account: string;
  name: string;
  /** "betaling" = hvor pengene lander, "salg" = inntektskonto. */
  kind: "betaling" | "salg";
  /** Mva-kode i Tripletex (kun salgskontoer i account-modus). */
  vatCode?: string;
};

/**
 * Kontoplanen systemet konterer etter – samme kilde som dagsbilaget bruker, så
 * oversikten kan aldri komme i utakt med de faktiske posteringene. Speiler
 * Fixit sin Kontoplan-fane. I "account"-modus har salgskontoene mva-kode 3
 * (Tripletex regner mva selv); i "explicit" føres mva eksplisitt til 2700.
 */
export function accountPlan(vatMode: VatMode = defaultVatMode()): {
  rows: AccountPlanRow[];
  vatMode: VatMode;
} {
  const rows: AccountPlanRow[] = [
    { account: "1900", name: "Kontanter", kind: "betaling" },
    { account: METHOD_ACCOUNT.kort.account, name: METHOD_ACCOUNT.kort.name, kind: "betaling" },
    { account: METHOD_ACCOUNT.vipps.account, name: METHOD_ACCOUNT.vipps.name, kind: "betaling" },
    { account: METHOD_ACCOUNT.gavekort.account, name: METHOD_ACCOUNT.gavekort.name, kind: "betaling" },
    {
      account: SERVICE_SALES_ACCOUNT.account,
      name: SERVICE_SALES_ACCOUNT.name,
      kind: "salg",
      vatCode: vatMode === "account" ? "3" : undefined,
    },
    {
      account: PRODUCT_SALES_ACCOUNT.account,
      name: PRODUCT_SALES_ACCOUNT.name,
      kind: "salg",
      vatCode: vatMode === "account" ? "3" : undefined,
    },
  ];
  if (vatMode === "explicit") {
    rows.push({ account: VAT_ACCOUNT.account, name: VAT_ACCOUNT.name, kind: "salg" });
  }
  return { rows, vatMode };
}

export type IncomeLedger = {
  lines: LedgerLine[];
  vatMode: VatMode;
  inkl: number;
  eks: number;
  mva: number;
  /** Netto salgsinntekt fordelt på tjenester vs. varer (eks. mva). */
  serviceEks: number;
  productEks: number;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  count: number;
};

/**
 * Sum av salgslinjer per type (tjeneste vs. vare) for perioden. Brukes kun til
 * å finne fordelingsnøkkelen mellom tjeneste- og varesalg – selve debet/kredit
 * bygges på faktisk innbetaling, så en evt. avstand mellom linjesum og
 * betalingssum påvirker bare fordelingen, aldri balansen.
 */
async function revenueSplitByKind(
  startIso: string,
  endIso: string,
): Promise<{ product: number; service: number }> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("sale_items")
      .select("kind, price_nok, sales!inner(sold_at)")
      .gte("sales.sold_at", startIso)
      .lt("sales.sold_at", endIso)
      .limit(100000);
    let product = 0;
    let service = 0;
    for (const it of data ?? []) {
      const amt = Number((it as { price_nok?: number }).price_nok) || 0;
      if ((it as { kind?: string }).kind === "product") product += amt;
      else service += amt; // tjenester + øvrige linjer som i dag
    }
    return { product, service };
  } catch {
    return { product: 0, service: 0 };
  }
}

/**
 * Avledet hovedbok (inntektssiden) for en periode: debet per betalingsmåte
 * (kundens innbetaling inkl. mva) mot kredit salgsinntekt (eks. mva) +
 * utgående mva. Kredit-siden regnes fra faktisk debet-sum, så oppstillingen
 * alltid balanserer (debet = kredit). Salgsinntekten fordeles på tjeneste- og
 * vare-konto etter forholdet mellom tjeneste- og varelinjer i perioden.
 */
export async function deriveIncomeLedger(
  startIso: string,
  endIso: string,
  vatMode: VatMode = defaultVatMode(),
): Promise<IncomeLedger> {
  const [rep, split] = await Promise.all([
    getPeriodReport(startIso, endIso),
    revenueSplitByKind(startIso, endIso),
  ]);

  // Debet per betalingsmåte.
  const debitMap = new Map<string, LedgerLine>();
  for (const m of rep.byMethod) {
    const key = (m.method || "").trim().toLowerCase();
    const acc = METHOD_ACCOUNT[key] ?? OTHER_ACCOUNT;
    const cur =
      debitMap.get(acc.account) ??
      { account: acc.account, name: acc.name, debit: 0, credit: 0 };
    cur.debit += m.nok;
    debitMap.set(acc.account, cur);
  }
  const debitLines = Array.from(debitMap.values()).sort((a, b) =>
    a.account.localeCompare(b.account),
  );
  const totalDebit = debitLines.reduce((s, l) => s + l.debit, 0);

  // Kredit fra faktisk debet-sum (inkl. mva) → garantert balanse.
  const eks = Math.round(totalDebit / (1 + PAYROLL.MVA));
  const mva = totalDebit - eks;

  // Fordel netto salgsinntekt på vare vs. tjeneste. Varens andel avrundes og
  // tjenesten tar resten, så summen treffer `eks` eksakt.
  const base = split.product + split.service;
  const productEks = base > 0 ? Math.round((eks * split.product) / base) : 0;
  const serviceEks = eks - productEks;

  // Brutto-fordeling (inkl. mva) – brukes i "account"-modus der Tripletex selv
  // regner ut mva. Summen treffer totalDebit eksakt (varen avrundes, tjenesten
  // tar resten).
  const productGross = base > 0 ? Math.round((totalDebit * split.product) / base) : 0;
  const serviceGross = totalDebit - productGross;

  const creditLines: LedgerLine[] = [];
  if (vatMode === "account") {
    // Brutto til salgskonto; Tripletex regner mva via kontoens mva-kode.
    if (serviceGross !== 0)
      creditLines.push({ ...SERVICE_SALES_ACCOUNT, debit: 0, credit: serviceGross });
    if (productGross !== 0)
      creditLines.push({ ...PRODUCT_SALES_ACCOUNT, debit: 0, credit: productGross });
  } else {
    // Netto til salgskonto + eksplisitt utgående mva til 2700.
    if (serviceEks !== 0)
      creditLines.push({ ...SERVICE_SALES_ACCOUNT, debit: 0, credit: serviceEks });
    if (productEks !== 0)
      creditLines.push({ ...PRODUCT_SALES_ACCOUNT, debit: 0, credit: productEks });
    if (mva !== 0) creditLines.push({ ...VAT_ACCOUNT, debit: 0, credit: mva });
  }

  const lines: LedgerLine[] = [...debitLines, ...creditLines];
  const totalCredit = creditLines.reduce((s, l) => s + l.credit, 0);

  return {
    lines,
    vatMode,
    inkl: totalDebit,
    eks,
    mva,
    serviceEks,
    productEks,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    count: rep.count,
  };
}
