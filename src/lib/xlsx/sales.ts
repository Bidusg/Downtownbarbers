import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import {
  getRevenueBreakdown,
  type Range,
  type Breakdown,
} from "@/lib/report-queries";
import { INK, MUTED, MONEY, styleHeader, titleBlock } from "@/lib/xlsx/style";

/* =====================================================================
 * SALG – EXCEL (.xlsx)
 *   Revisorvennlig arbeidsbok for en periode: Sammendrag (total, antall,
 *   snitt, per barber, per betalingsmåte) + Salg (én rad per salg med
 *   dato, barber, kunde, beløp, rabatt, betalingsmåte). Samme stil som
 *   regnskaps-eksporten.
 * ===================================================================== */

type SaleRow = {
  sold_at: string;
  total_nok: number | null;
  discount_nok: number | null;
  payment_method: string | null;
  staff: { full_name?: string } | null;
  customers: { full_name?: string } | null;
};

async function fetchSales(r: Range): Promise<SaleRow[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("sales")
    .select(
      "sold_at, total_nok, discount_nok, payment_method, staff(full_name), customers(full_name)",
    )
    .gte("sold_at", r.startIso)
    .lt("sold_at", r.endIso)
    .order("sold_at", { ascending: false })
    .limit(50000);
  return (data ?? []) as SaleRow[];
}

function osloDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      timeZone: "Europe/Oslo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function buildSalesWorkbook(r: Range) {
  const [breakdown, sales] = await Promise.all([
    getRevenueBreakdown(r),
    fetchSales(r),
  ]);
  return workbookFromData(r, breakdown, sales);
}

async function workbookFromData(r: Range, b: Breakdown, sales: SaleRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Downtown Barbers";
  wb.created = new Date();

  /* ---- Sammendrag ---- */
  const s = wb.addWorksheet("Sammendrag");
  s.getColumn(1).width = 36;
  s.getColumn(2).width = 20;
  titleBlock(s, "Downtown Barbers – Salgssammendrag", `Periode: ${r.from} – ${r.to}`);
  s.addRow([]);

  const kv = (label: string, value: number) => {
    const row = s.addRow([label, value]);
    row.getCell(1).font = { color: { argb: INK } };
    row.getCell(2).numFmt = MONEY;
    return row;
  };
  kv("Omsetning totalt", Math.round(b.total)).getCell(2).font = { bold: true };
  const cnt = s.addRow(["Antall salg", b.saleCount]);
  cnt.getCell(1).font = { color: { argb: INK } };
  kv("Snitt per salg", Math.round(b.avg));
  kv("Internt (kassesalg)", Math.round(b.internal));
  kv("Eksternt (Zettle o.l.)", Math.round(b.external));

  s.addRow([]);
  const bh = s.addRow(["Per barber", "Omsetning"]);
  bh.font = { bold: true, color: { argb: MUTED } };
  for (const row of b.byBarber) {
    const rr = s.addRow([row.name, Math.round(row.nok)]);
    rr.getCell(2).numFmt = MONEY;
  }

  s.addRow([]);
  const mh = s.addRow(["Per betalingsmåte", "Omsetning"]);
  mh.font = { bold: true, color: { argb: MUTED } };
  for (const row of b.byMethod) {
    const rr = s.addRow([row.method, Math.round(row.nok)]);
    rr.getCell(2).numFmt = MONEY;
  }

  /* ---- Salg (detaljer) ---- */
  const d = wb.addWorksheet("Salg");
  d.columns = [
    { header: "Dato", key: "dato", width: 20 },
    { header: "Barber", key: "barber", width: 22 },
    { header: "Kunde", key: "kunde", width: 24 },
    { header: "Beløp", key: "belop", width: 14 },
    { header: "Rabatt", key: "rabatt", width: 12 },
    { header: "Betalingsmåte", key: "metode", width: 16 },
  ];
  for (const row of sales) {
    d.addRow({
      dato: osloDateTime(row.sold_at),
      barber: row.staff?.full_name ?? "",
      kunde: row.customers?.full_name ?? "",
      belop: Math.round(Number(row.total_nok) || 0),
      rabatt: Math.round(Number(row.discount_nok) || 0),
      metode: row.payment_method ?? "",
    });
  }
  d.getColumn("belop").numFmt = MONEY;
  d.getColumn("rabatt").numFmt = MONEY;
  styleHeader(d, 6);

  return wb.xlsx.writeBuffer();
}
