import { createClient } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/site-settings";
import type { Range } from "@/lib/report-queries";

/* =====================================================================
 * SAF-T Financial (Regnskap) v1.30 – eksport for revisor.
 *
 *   Bygger en strukturert SAF-T Financial XML fra salgssiden (kassesalg):
 *   standard kontoplan, MVA-kode og balanserte daglige bilag (debet
 *   kasse/bank, kredit salgsinntekt + utgående mva).
 *
 *   VIKTIG (ærlig avgrensning): dette dekker INNTEKTSSIDEN. Fullt lovpålagt
 *   SAF-T med kjøp/kostnader, lønnsposteringer og inn-/utgående balanse
 *   kommer fra det komplette regnskapet. Kjør filen gjennom Skatteetatens
 *   SAF-T-validator (eller revisors verktøy) før offisiell innsending – vi
 *   kan justere mot valideringsutskriften.
 *
 *   Firmafelt (org.nr, adresse, postnr) leses fra settings-nøkkelen
 *   'saft_company' (JSON) med fornuftige fallback-verdier, så de kan
 *   settes korrekt uten kodeendring.
 * ===================================================================== */

const VAT_RATE = 25; // norsk standardsats

/* ---------- Kontoplan (standard) ---------- */
const ACCOUNTS = [
  { id: "1900", desc: "Kontanter", std: "19" },
  { id: "1920", desc: "Bankinnskudd", std: "19" },
  { id: "2700", desc: "Utgående merverdiavgift, høy sats", std: "27" },
  { id: "3000", desc: "Salgsinntekt, avgiftspliktig", std: "30" },
] as const;

const TAX_CODE = "3"; // utgående mva 25 % (standard norsk mva-kode)

export type SaftCompany = {
  orgnr: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
};

/** Firmafelt fra settings ('saft_company') med fallback fra site-settings. */
async function getSaftCompany(): Promise<SaftCompany> {
  const site = await getSiteSettings();
  const fallback: SaftCompany = {
    orgnr: "921204132", // Downtown Barbers AS (offentlig registernr) – overstyres av settings
    name: site.name || "Downtown Barbers AS",
    street: site.address || "",
    postalCode: "0183",
    city: "Oslo",
  };
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("settings")
      .select("value")
      .eq("key", "saft_company")
      .maybeSingle();
    const v = (data?.value ?? {}) as Partial<SaftCompany>;
    return {
      orgnr: (v.orgnr && String(v.orgnr).trim()) || fallback.orgnr,
      name: (v.name && String(v.name).trim()) || fallback.name,
      street: (v.street && String(v.street).trim()) || fallback.street,
      postalCode: (v.postalCode && String(v.postalCode).trim()) || fallback.postalCode,
      city: (v.city && String(v.city).trim()) || fallback.city,
    };
  } catch {
    return fallback;
  }
}

/* ---------- Hjelpere ---------- */
const OSLO = "Europe/Oslo";
const xml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const osloDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: OSLO }); // yyyy-mm-dd

/** MVA-splitt: net + vat = gross eksakt (vat rundes, net er resten). */
function splitVat(gross: number): { net: number; vat: number } {
  const vat = Math.round((gross - gross / (1 + VAT_RATE / 100)) * 100) / 100;
  return { net: Math.round((gross - vat) * 100) / 100, vat };
}

const isCash = (m: string | null): boolean => {
  const v = (m ?? "").toLowerCase();
  return v.includes("kontant") || v.includes("cash");
};

type DayAgg = { cash: number; bank: number; gross: number };

/** Bygg SAF-T Financial v1.30 XML for perioden. */
export async function buildSaftXml(r: Range): Promise<string> {
  const [company] = await Promise.all([getSaftCompany()]);
  const sb = await createClient();

  const salesRes = await sb
    .from("sales")
    .select("sold_at, total_nok, payment_method")
    .gte("sold_at", r.startIso)
    .lt("sold_at", r.endIso)
    .limit(200000);

  // Aggreger per Oslo-dag: kontant vs bank (kort/vipps → bank).
  const byDay = new Map<string, DayAgg>();
  const add = (day: string, gross: number, cash: boolean) => {
    const cur = byDay.get(day) ?? { cash: 0, bank: 0, gross: 0 };
    if (cash) cur.cash += gross;
    else cur.bank += gross;
    cur.gross += gross;
    byDay.set(day, cur);
  };
  for (const s of (salesRes.data ?? []) as { sold_at: string; total_nok: number; payment_method: string | null }[]) {
    add(osloDay(s.sold_at), Number(s.total_nok) || 0, isCash(s.payment_method));
  }

  const days = Array.from(byDay.keys()).sort();

  // Bygg transaksjoner + totaler.
  let totalDebit = 0;
  let totalCredit = 0;
  const txns: string[] = [];
  days.forEach((day, i) => {
    const agg = byDay.get(day)!;
    if (agg.gross <= 0) return;
    const { net, vat } = splitVat(agg.gross);
    const [yy, mm] = day.split("-").map(Number);
    const period = mm;
    let rec = 0;
    const lines: string[] = [];
    if (agg.cash > 0) {
      rec++;
      lines.push(glLine(rec, "1900", "Kontantsalg", { debit: agg.cash }));
    }
    if (agg.bank > 0) {
      rec++;
      lines.push(glLine(rec, "1920", "Kort/Vipps-salg", { debit: agg.bank }));
    }
    rec++;
    lines.push(
      glLine(rec, "3000", "Salgsinntekt", {
        credit: net,
        tax: { code: TAX_CODE, pct: VAT_RATE, amount: vat },
      }),
    );
    rec++;
    lines.push(glLine(rec, "2700", "Utgående mva 25%", { credit: vat }));

    totalDebit += agg.gross;
    totalCredit += net + vat;

    txns.push(
      `      <Transaction>
        <TransactionID>${day}</TransactionID>
        <Period>${period}</Period>
        <PeriodYear>${yy}</PeriodYear>
        <TransactionDate>${day}</TransactionDate>
        <Description>Dagsoppgjør salg ${day}</Description>
        <SystemEntryDate>${day}</SystemEntryDate>
        <GLPostingDate>${day}</GLPostingDate>
${lines.join("\n")}
      </Transaction>`,
    );
    void i;
  });

  const created = new Date().toLocaleDateString("en-CA", { timeZone: OSLO });

  const accountsXml = ACCOUNTS.map(
    (a) => `      <Account>
        <AccountID>${a.id}</AccountID>
        <AccountDescription>${xml(a.desc)}</AccountDescription>
        <StandardAccountID>${a.std}</StandardAccountID>
        <AccountType>GL</AccountType>
        <OpeningDebitBalance>0.00</OpeningDebitBalance>
        <ClosingDebitBalance>0.00</ClosingDebitBalance>
      </Account>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO">
  <Header>
    <AuditFileVersion>1.30</AuditFileVersion>
    <AuditFileCountry>NO</AuditFileCountry>
    <AuditFileDateCreated>${created}</AuditFileDateCreated>
    <SoftwareCompanyName>Downtown Barbers Platform</SoftwareCompanyName>
    <SoftwareID>Downtown Barbers</SoftwareID>
    <SoftwareVersion>1.0</SoftwareVersion>
    <Company>
      <RegistrationNumber>${xml(company.orgnr)}</RegistrationNumber>
      <Name>${xml(company.name)}</Name>
      <Address>
        <StreetName>${xml(company.street)}</StreetName>
        <City>${xml(company.city)}</City>
        <PostalCode>${xml(company.postalCode)}</PostalCode>
        <Country>NO</Country>
        <AddressType>StreetAddress</AddressType>
      </Address>
      <TaxRegistration>
        <TaxRegistrationNumber>NO${xml(company.orgnr)}MVA</TaxRegistrationNumber>
      </TaxRegistration>
    </Company>
    <DefaultCurrencyCode>NOK</DefaultCurrencyCode>
    <SelectionCriteria>
      <SelectionStartDate>${r.from}</SelectionStartDate>
      <SelectionEndDate>${r.to}</SelectionEndDate>
    </SelectionCriteria>
    <TaxAccountingBasis>A</TaxAccountingBasis>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>
${accountsXml}
    </GeneralLedgerAccounts>
    <TaxTable>
      <TaxTableEntry>
        <TaxType>MVA</TaxType>
        <Description>Merverdiavgift</Description>
        <TaxCodeDetails>
          <TaxCode>${TAX_CODE}</TaxCode>
          <Description>Utgående merverdiavgift, 25%</Description>
          <TaxPercentage>${VAT_RATE}.00</TaxPercentage>
          <Country>NO</Country>
          <StandardTaxCode>${TAX_CODE}</StandardTaxCode>
        </TaxCodeDetails>
      </TaxTableEntry>
    </TaxTable>
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>${txns.length}</NumberOfEntries>
    <TotalDebit>${amt(totalDebit)}</TotalDebit>
    <TotalCredit>${amt(totalCredit)}</TotalCredit>
    <Journal>
      <JournalID>SALG</JournalID>
      <Description>Dagsoppgjør fra kassesystem</Description>
      <Type>GL</Type>
${txns.join("\n")}
    </Journal>
  </GeneralLedgerEntries>
</AuditFile>
`;
}

/** Én hovedboklinje. Debet ELLER kredit, evt. med mva-informasjon. */
function glLine(
  recordId: number,
  accountId: string,
  description: string,
  opts: { debit?: number; credit?: number; tax?: { code: string; pct: number; amount: number } },
): string {
  const taxXml = opts.tax
    ? `
          <TaxInformation>
            <TaxType>MVA</TaxType>
            <TaxCode>${opts.tax.code}</TaxCode>
            <TaxPercentage>${opts.tax.pct}.00</TaxPercentage>
            <TaxAmount>
              <Amount>${amt(opts.tax.amount)}</Amount>
            </TaxAmount>
          </TaxInformation>`
    : "";
  const amountXml =
    opts.debit !== undefined
      ? `          <DebitAmount>
            <Amount>${amt(opts.debit)}</Amount>
          </DebitAmount>`
      : `          <CreditAmount>
            <Amount>${amt(opts.credit ?? 0)}</Amount>
          </CreditAmount>`;
  return `        <Line>
          <RecordID>${recordId}</RecordID>
          <AccountID>${accountId}</AccountID>
          <Description>${xml(description)}</Description>
${amountXml}${taxXml}
        </Line>`;
}
