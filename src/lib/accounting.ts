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
const SALES_ACCOUNT = { account: "3000", name: "Salgsinntekt, avgiftspliktig" };
const VAT_ACCOUNT = { account: "2700", name: "Utgående mva (25 %)" };

export type IncomeLedger = {
  lines: LedgerLine[];
  inkl: number;
  eks: number;
  mva: number;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  count: number;
};

/**
 * Avledet hovedbok (inntektssiden) for en periode: debet per betalingsmåte
 * (kundens innbetaling inkl. mva) mot kredit salgsinntekt (eks. mva) +
 * utgående mva. Kredit-siden regnes fra faktisk debet-sum, så oppstillingen
 * alltid balanserer (debet = kredit).
 */
export async function deriveIncomeLedger(
  startIso: string,
  endIso: string,
): Promise<IncomeLedger> {
  const rep = await getPeriodReport(startIso, endIso);

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

  const lines: LedgerLine[] = [
    ...debitLines,
    { ...SALES_ACCOUNT, debit: 0, credit: eks },
    { ...VAT_ACCOUNT, debit: 0, credit: mva },
  ];
  const totalCredit = eks + mva;

  return {
    lines,
    inkl: totalDebit,
    eks,
    mva,
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    count: rep.count,
  };
}
