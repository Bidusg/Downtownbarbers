// Regnskapsmodul – Fase 1 (avledet hovedbok, inntektssiden).
//
// Dette er en FORELØPIG, AVLEDET oppstilling: den regner om registrert salg
// til en konto-oppstilling (debet/kredit) etter enkle konteringsregler. Den
// lager IKKE et uforanderlig bilagsspor og er IKKE kvalitetssikret regnskap.
// Kontoplan og mva-koder må bekreftes av regnskapsfører før offisiell bruk.
// Tripletex er regnskapssystemet (master); denne oppstillingen er kun en
// avledet inntektsoversikt (se REGNSKAPSMODUL-PLAN.md).

import { PAYROLL } from "@/lib/ops-queries";
import { getPeriodReport } from "@/lib/dashboard-queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type LedgerLine = {
  account: string;
  name: string;
  debit: number;
  credit: number;
};

// GAVEKORT-GJELD (regnskapskritisk – endret etter krav fra Kumar):
//   Salg av et gavekort er IKKE salg av en vare/tjeneste og skal IKKE momses.
//   Det er en FORSKUDDSBETALING fra kunden (vi skylder en behandling/vare
//   senere), og skal KREDITERES en GJELDSKONTO «Forskudd fra kunder» – uten
//   mva, og IKKE på salgskontoene (3001/3020). Når gavekortet INNLØSES skjer
//   det faktiske, mva-pliktige salget: da krediteres salgskontoen (med mva via
//   kontoens mva-kode) og gjeldskontoen DEBITERES (gjelden ned). Mva tas altså
//   ved innløsning, ikke ved salg.
//   Gavekort er derfor en BETALINGSMÅTE som peker på GJELDSKONTOEN, ikke en
//   eiendel (tidligere feilaktig ført på 1522 Gavekort som om det var en
//   eiendel). Standard konto er 2900; KUMAR MÅ BEKREFTE kontonummeret mot
//   Downtown Barbers' kontoplan i Tripletex. Overstyres via env
//   TRIPLETEX_ACCOUNT_GIFTCARD.
const GIFT_CARD_LIABILITY_ACCOUNT = {
  account: process.env.TRIPLETEX_ACCOUNT_GIFTCARD || "2900",
  name: "Forskudd fra kunder (gavekort)",
};

// Kontoplan (inntektssiden) – bekreftet av regnskapsfører Kumar (Alt Innen AS)
// og samstemt med Fixit-kontoplanen for Downtown Barbers:
//   Betaling: 1520 Bankkort (kort), 1521 Vipps, 1900 Kontanter.
//   Gavekort: 2900 Forskudd fra kunder (GJELD, ikke eiendel) – se over.
//   Salg:     3001 Behandlinger (tjenester), 3020 Varesalg (varer) – mva-kode 3.
// VIKTIG (Kumar): IKKE bruk 1920, og IKKE post egen mva-konto (2700). Tripletex
// regner mva selv via mva-kode 3 på salgskontoene → vi kjører "account"-modus.
const METHOD_ACCOUNT: Record<string, { account: string; name: string }> = {
  kontant: { account: "1900", name: "Kontanter" },
  cash: { account: "1900", name: "Kontanter" },
  kort: { account: "1520", name: "Bankkort" },
  card: { account: "1520", name: "Bankkort" },
  vipps: { account: "1521", name: "Vipps" },
  // Gavekort som betaling (innløsning) DEBITERER gjeldskontoen (2900), ikke en
  // eiendel. Selve tjeneste-/varesalget bokføres med mva som normalt (3001/3020).
  gavekort: { account: GIFT_CARD_LIABILITY_ACCOUNT.account, name: GIFT_CARD_LIABILITY_ACCOUNT.name },
  giftcard: { account: GIFT_CARD_LIABILITY_ACCOUNT.account, name: GIFT_CARD_LIABILITY_ACCOUNT.name },
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
  /**
   * "betaling" = hvor pengene lander, "salg" = inntektskonto,
   * "gjeld" = gjeldskonto (gavekort = forskudd fra kunder, ikke omsetning).
   */
  kind: "betaling" | "salg" | "gjeld";
  /** Mva-kode i Tripletex (kun salgskontoer i account-modus). */
  vatCode?: string;
  /** Kort forklaring til revisor/admin (f.eks. mva-behandling). */
  note?: string;
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
    {
      // Gavekort = forskudd fra kunder (GJELD), ikke avgiftspliktig salg. Mva
      // tas ved innløsning. Salg av gavekort krediterer denne kontoen uten mva;
      // innløsning debiterer den. KUMAR MÅ BEKREFTE kontonummeret.
      account: GIFT_CARD_LIABILITY_ACCOUNT.account,
      name: GIFT_CARD_LIABILITY_ACCOUNT.name,
      kind: "gjeld",
      note: "Forskuddsbetaling – ikke avgiftspliktig salg. Mva tas ved innløsning.",
    },
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
 * Gavekort SOLGT i perioden, fordelt på betalingsmåten pengene kom inn med.
 * Dette er FORSKUDD (ikke omsetning): salg av gavekort skal bokføres som
 * penger inn (kontant/kort/vipps) DEBET mot KREDIT på gjeldskontoen (2900),
 * UTEN mva og IKKE på salgskontoene. Mva tas først ved innløsning.
 *
 * Kilden er gift_cards.sold_payment_method (betalingsmåten som ble registrert
 * da gavekortet ble utstedt – se KJØR-I-SUPABASE-GAVEKORT-REGNSKAP.sql). Rader
 * UTEN registrert betalingsmåte (promo/gratis gavekort, eller eldre rader fra
 * før kolonnen fantes) hoppes bevisst over – de kan ikke henføres til en
 * konkret betalingskonto og må føres manuelt av regnskapsfører.
 *
 * TRYGG FALLBACK: leses med service-klient (bypasser RLS, funker også i cron)
 * og er pakket i try/catch. Finnes ikke kolonnen enda (SQL ikke kjørt), mangler
 * service-nøkkelen, eller feiler spørringen → tom liste, og dagsbilaget er
 * nøyaktig som før (ingenting krasjer).
 */
async function giftCardSalesByMethod(
  startIso: string,
  endIso: string,
): Promise<{ method: string; nok: number }[]> {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("gift_cards")
      .select("initial_nok, sold_payment_method, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .not("sold_payment_method", "is", null)
      .limit(100000);
    if (error) return [];
    const map = new Map<string, number>();
    for (const g of data ?? []) {
      const method = String((g as { sold_payment_method?: string }).sold_payment_method || "").trim();
      const amt = Number((g as { initial_nok?: number }).initial_nok) || 0;
      if (!method || amt <= 0) continue;
      map.set(method, (map.get(method) ?? 0) + amt);
    }
    return Array.from(map, ([method, nok]) => ({ method, nok: Math.round(nok) }));
  } catch {
    return [];
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
  const [rep, split, giftSales] = await Promise.all([
    getPeriodReport(startIso, endIso),
    revenueSplitByKind(startIso, endIso),
    giftCardSalesByMethod(startIso, endIso),
  ]);

  // --- SALG av behandlinger/varer (avgiftspliktig omsetning) ---
  // Debet per betalingsmåte. VIKTIG: gavekort-INNLØSNING kommer inn her som
  // betalingsmåten «Gavekort» (sale_payments) og mapper til gjeldskontoen
  // (2900) via METHOD_ACCOUNT – da debiteres gjelden (ned) mens selve salget
  // krediteres salgskontoen med mva. Gavekort-SALG er IKKE med her (det er ikke
  // omsetning); det håndteres separat lenger ned som forskudd.
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
  const salesDebitTotal = debitLines.reduce((s, l) => s + l.debit, 0);

  // Kredit (omsetning) fra faktisk salgs-debet-sum (inkl. mva) → garantert
  // balanse på salgsdelen. Mva beregnes KUN av omsetningen, aldri av
  // gavekort-salg (forskudd er mva-fritt).
  const eks = Math.round(salesDebitTotal / (1 + PAYROLL.MVA));
  const mva = salesDebitTotal - eks;

  // Fordel netto salgsinntekt på vare vs. tjeneste. Varens andel avrundes og
  // tjenesten tar resten, så summen treffer `eks` eksakt.
  const base = split.product + split.service;
  const productEks = base > 0 ? Math.round((eks * split.product) / base) : 0;
  const serviceEks = eks - productEks;

  // Brutto-fordeling (inkl. mva) – brukes i "account"-modus der Tripletex selv
  // regner ut mva. Summen treffer salgs-debet-summen eksakt (varen avrundes,
  // tjenesten tar resten).
  const productGross = base > 0 ? Math.round((salesDebitTotal * split.product) / base) : 0;
  const serviceGross = salesDebitTotal - productGross;

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

  // --- SALG av gavekort (FORSKUDD, ikke omsetning, INGEN mva) ---
  // Penger inn (kontant/kort/vipps) DEBET mot KREDIT på gjeldskontoen (2900).
  // Dette er selvbalanserende (debet = kredit per krone) og holdes HELT utenfor
  // mva-/omsetningsberegningen over, slik at gavekort-salg aldri blåser opp
  // avgiftspliktig omsetning. Debet slås sammen per konto med salgs-innbetaling
  // (f.eks. kontanter fra både klipp og gavekort samles på 1900).
  const giftDebitMap = new Map<string, LedgerLine>();
  let giftSaleTotal = 0;
  for (const g of giftSales) {
    const key = (g.method || "").trim().toLowerCase();
    const acc = METHOD_ACCOUNT[key] ?? OTHER_ACCOUNT;
    // Vern: et gavekort «betalt med gavekort» gir ingen mening og ville peke på
    // gjeldskontoen – hopp over så vi ikke fører forskudd mot forskudd.
    if (acc.account === GIFT_CARD_LIABILITY_ACCOUNT.account) continue;
    const cur =
      giftDebitMap.get(acc.account) ??
      { account: acc.account, name: acc.name, debit: 0, credit: 0 };
    cur.debit += g.nok;
    giftDebitMap.set(acc.account, cur);
    giftSaleTotal += g.nok;
  }

  // Flett salgs-innbetaling og gavekort-innbetaling per konto på debet-siden.
  const mergedDebit = new Map<string, LedgerLine>();
  for (const l of debitLines) mergedDebit.set(l.account, { ...l });
  for (const [acc, l] of giftDebitMap) {
    const cur =
      mergedDebit.get(acc) ?? { account: l.account, name: l.name, debit: 0, credit: 0 };
    cur.debit += l.debit;
    mergedDebit.set(acc, cur);
  }
  const finalDebitLines = Array.from(mergedDebit.values()).sort((a, b) =>
    a.account.localeCompare(b.account),
  );

  // Kredit gjeldskontoen for solgte gavekort (aggregert én linje).
  const giftCreditLines: LedgerLine[] =
    giftSaleTotal > 0
      ? [{ ...GIFT_CARD_LIABILITY_ACCOUNT, debit: 0, credit: giftSaleTotal }]
      : [];

  const lines: LedgerLine[] = [...finalDebitLines, ...creditLines, ...giftCreditLines];
  const totalDebit = finalDebitLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = [...creditLines, ...giftCreditLines].reduce(
    (s, l) => s + l.credit,
    0,
  );

  return {
    lines,
    vatMode,
    // Omsetnings-tallene gjelder KUN avgiftspliktig salg (eks. gavekort-salg).
    inkl: salesDebitTotal,
    eks,
    mva,
    serviceEks,
    productEks,
    // Totaler/balanse gjelder HELE dagsbilaget (salg + gavekort-forskudd).
    totalDebit,
    totalCredit,
    balanced: totalDebit === totalCredit,
    count: rep.count,
  };
}
