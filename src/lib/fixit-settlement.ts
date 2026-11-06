import { getDocumentProxy } from "unpdf";

/* =====================================================================
 * Fixit «Kasseoppgjør»-rapport (PDF) → rader per oppgjør.
 *
 * Kolonnene i Fixit-rapporten (alle beløp inkl. mva):
 *   Nr | Dato | Av | Behandl. | Varesalg | Gr1 | Gr2 | Sum tot | Kontant |
 *   Bankkort | Kred.kort | Kreditt | Gavek | Giro | Kredtitt | Veksel inn | ut
 *
 * Fixit-rapporten har ingen Vipps-kolonne: det som står i «Sum tot» men ikke
 * i noen betalingskolonne regnes som «annet» (i praksis Vipps).
 * ===================================================================== */

export type FixitSettlementRow = {
  nr: number;
  /** yyyy-mm-dd */
  date: string;
  treatment: number;
  products: number;
  total: number;
  cash: number;
  bankCard: number;
  creditCard: number;
  credit: number;
  giftCard: number;
  giro: number;
  /** Sum tot − alle betalingskolonner (≥ 0) – i praksis Vipps. */
  other: number;
};

/** «12 607», «0,00», «1 124» → tall. */
function toNum(s: string): number | null {
  const t = s.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** Tolker cellene på én linje. Returnerer null hvis linja ikke er en oppgjørsrad. */
export function parseFixitCells(cells: string[]): FixitSettlementRow | null {
  const c = cells.map((x) => x.trim()).filter(Boolean);
  const di = c.findIndex((x) => DATE_RE.test(x));
  if (di < 1) return null;
  const nr = toNum(c[di - 1]);
  if (nr == null || !Number.isInteger(nr)) return null;
  const m = DATE_RE.exec(c[di])!;
  const date = `${m[3]}-${m[2]}-${m[1]}`;

  // Tallene etter datoen (initialene «Av» hoppes over).
  const nums: number[] = [];
  for (const x of c.slice(di + 1)) {
    const n = toNum(x);
    if (n != null) nums.push(n);
  }
  // Behandl, Varesalg, Gr1, Gr2, Sum tot, Kontant, Bankkort, Kred.kort, Kreditt, Gavek, Giro …
  if (nums.length < 11) return null;
  const [treatment, products, , , total, cash, bankCard, creditCard, credit, giftCard, giro] = nums;
  const paid = cash + bankCard + creditCard + credit + giftCard + giro;
  return {
    nr,
    date,
    treatment,
    products,
    total,
    cash,
    bankCard,
    creditCard,
    credit,
    giftCard,
    giro,
    other: Math.max(0, Math.round((total - paid) * 100) / 100),
  };
}

/**
 * Leser Fixit-PDF-en. Tekstbitene grupperes til linjer etter høyde på siden,
 * slik at «5 309» (tusenskille med mellomrom) forblir ett tall.
 */
export async function parseFixitSettlementPdf(bytes: Uint8Array): Promise<{
  rows: FixitSettlementRow[];
  period: string | null;
}> {
  const pdf = await getDocumentProxy(bytes);
  const rows: FixitSettlementRow[] = [];
  let period: string | null = null;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2; // tåler små høydeforskjeller
      const arr = lines.get(y) ?? [];
      arr.push({ x: it.transform[4], s: it.str });
      lines.set(y, arr);
    }
    for (const [, arr] of [...lines].sort((a, b) => b[0] - a[0])) {
      const cells = arr.sort((a, b) => a.x - b.x).map((x) => x.s);
      const joined = cells.join(" ");
      const pm = /periode\s+(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/i.exec(joined);
      if (pm && !period) period = `${pm[1]} – ${pm[2]}`;
      // Celler som er slått sammen med store mellomrom deles opp.
      const split = cells.flatMap((x) => x.split(/\s{2,}/));
      const row = parseFixitCells(split);
      if (row) rows.push(row);
    }
  }
  // Tomme oppgjør (alt 0) tas ikke med.
  return { rows: rows.filter((r) => r.total !== 0 || r.cash !== 0), period };
}
