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

// Foreløpig kontoplan (inntektssiden) – NS 4102-basert. Må bekreftes.
const METHOD_ACCOUNT: Record<string, { account: string; name: string }> = {
  kontant: { account: "1900", name: "Kontanter" },
  cash: { account: "1900", name: "Kontanter" },
  kort: { account: "1920", name: "Bankinnskudd (kort)" },
  card: { account: "1920", name: "Bankinnskudd (kort)" },
  vipps: { account: "1921", name: "Bankinnskudd (Vipps)" },
};
const OTHER_ACCOUNT = { account: "1990", name: "Uspesifisert oppgjør" };

// Salgsinntekt splittes på tjenester vs. varesalg. Kontonumrene kan overstyres
// via env (Kumar bekrefter de endelige – 3000/3001 er foreløpige). Uten
// varelinjer havner alt på tjeneste-kontoen, akkurat som før splitten.
const SERVICE_SALES_ACCOUNT = {
  account: process.env.TRIPLETEX_ACCOUNT_SERVICE || "3000",
  name: "Salgsinntekt tjenester, avgiftspliktig",
};
const PRODUCT_SALES_ACCOUNT = {
  account: process.env.TRIPLETEX_ACCOUNT_PRODUCT || "3001",
  name: "Salgsinntekt varer, avgiftspliktig",
};
const VAT_ACCOUNT = { account: "2700", name: "Utgående mva (25 %)" };

export type IncomeLedger = {
  lines: LedgerLine[];
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

  const creditLines: LedgerLine[] = [];
  if (serviceEks !== 0)
    creditLines.push({ ...SERVICE_SALES_ACCOUNT, debit: 0, credit: serviceEks });
  if (productEks !== 0)
    creditLines.push({ ...PRODUCT_SALES_ACCOUNT, debit: 0, credit: productEks });
  if (mva !== 0) creditLines.push({ ...VAT_ACCOUNT, debit: 0, credit: mva });

  const lines: LedgerLine[] = [...debitLines, ...creditLines];
  const totalCredit = serviceEks + productEks + mva;

  return {
    lines,
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
