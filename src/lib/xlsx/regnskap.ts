import ExcelJS from "exceljs";
import {
  getRevenueBreakdown,
  getVatReport,
  type Range,
  type Breakdown,
  type VatReport,
} from "@/lib/report-queries";

/* =====================================================================
 * REGNSKAP – EXCEL (.xlsx)
 *   Revisorvennlig, formatert arbeidsbok: sammendrag + per barber +
 *   per betalingsmåte. kr-tallformat, fete totaler, frosne overskrifter.
 * ===================================================================== */

const ACCENT = "FFF47721";
const INK = "FF211E1A";
const MUTED = "FF8A807A";
const WHITE = "FFFFFFFF";
const MONEY = '#,##0 "kr"';

function headerFill(ws: ExcelJS.Worksheet, cols: number) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: WHITE } };
  h.height = 20;
  for (let i = 1; i <= cols; i++) {
    const c = h.getCell(i);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
    c.alignment = { vertical: "middle" };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildRegnskapWorkbook(r: Range): Promise<Buffer> {
  const [b, v] = await Promise.all([getRevenueBreakdown(r), getVatReport(r)]);
  return workbookFromData(r, b, v);
}

/** Ren bygger (uten DB) – testbar. */
export async function workbookFromData(
  r: Range,
  b: Breakdown,
  v: VatReport,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Downtown Barbers";
  wb.created = new Date();

  /* ---- Sammendrag ---- */
  const s = wb.addWorksheet("Sammendrag");
  s.getColumn(1).width = 36;
  s.getColumn(2).width = 20;

  s.mergeCells("A1:B1");
  s.getCell("A1").value = "Downtown Barbers – Regnskapssammendrag";
  s.getCell("A1").font = { bold: true, size: 14, color: { argb: INK } };
  s.mergeCells("A2:B2");
  s.getCell("A2").value = `Periode: ${r.from} – ${r.to}`;
  s.getCell("A2").font = { italic: true, color: { argb: MUTED } };
  s.addRow([]);

  const head = s.addRow(["Post", "Beløp"]);
  head.font = { bold: true, color: { argb: WHITE } };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  });

  const rows: { label: string; val: number; money?: boolean; bold?: boolean }[] = [
    { label: "Omsetning totalt (inkl. mva)", val: b.total, money: true, bold: true },
    { label: "   herav kasse", val: b.internal, money: true },
    { label: "   herav Zettle", val: b.external, money: true },
    { label: `Netto eks. mva`, val: v.total.net, money: true },
    { label: `MVA ${v.rate} %`, val: v.total.vat, money: true },
    { label: "Antall salg", val: b.saleCount },
    { label: "Snitt per salg", val: b.avg, money: true },
  ];
  for (const row of rows) {
    const rr = s.addRow([row.label, row.val]);
    if (row.money) rr.getCell(2).numFmt = MONEY;
    if (row.bold) rr.font = { bold: true };
    rr.getCell(2).alignment = { horizontal: "right" };
  }
  s.views = [{ state: "frozen", ySplit: 4 }];

  /* ---- Per barber ---- */
  const bb = wb.addWorksheet("Per barber");
  bb.columns = [
    { header: "Barber", key: "n", width: 30 },
    { header: "Omsetning", key: "v", width: 20, style: { numFmt: MONEY } },
  ];
  headerFill(bb, 2);
  for (const row of b.byBarber) bb.addRow({ n: row.name, v: row.nok });
  const tb = bb.addRow({ n: "Totalt", v: b.byBarber.reduce((a, x) => a + x.nok, 0) });
  tb.font = { bold: true };

  /* ---- Per betalingsmåte ---- */
  const bm = wb.addWorksheet("Per betalingsmåte");
  bm.columns = [
    { header: "Betalingsmåte", key: "m", width: 30 },
    { header: "Omsetning", key: "v", width: 20, style: { numFmt: MONEY } },
  ];
  headerFill(bm, 2);
  for (const row of b.byMethod) bm.addRow({ m: row.method, v: row.nok });
  const tm = bm.addRow({ m: "Totalt", v: b.byMethod.reduce((a, x) => a + x.nok, 0) });
  tm.font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
