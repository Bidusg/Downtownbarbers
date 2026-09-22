import ExcelJS from "exceljs";

/* =====================================================================
 * DELT XLSX-STIL for Downtown Barbers-eksporter.
 *   Aksent-header, kr-tallformat, frosne overskrifter – samme uttrykk
 *   som regnskaps- og grunndata-eksportene.
 * ===================================================================== */

export const ACCENT = "FFF47721";
export const INK = "FF211E1A";
export const MUTED = "FF8A807A";
export const WHITE = "FFFFFFFF";
export const MONEY = '#,##0 "kr"';

/** Aksent-header på rad 1 + frossen overskriftsrad. */
export function styleHeader(ws: ExcelJS.Worksheet, cols: number) {
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

/** Tittel + periode øverst i et sammendrags-ark (rad 1–2). */
export function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: INK } };
  ws.mergeCells("A2:B2");
  ws.getCell("A2").value = subtitle;
  ws.getCell("A2").font = { italic: true, color: { argb: MUTED } };
}
