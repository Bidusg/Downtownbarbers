import ExcelJS from "exceljs";
import type { Cell, ColType, Column, Kpi, ReportCategory, ReportSheet, Table } from "@/lib/reports/types";

/* =====================================================================
 * RAPPORTSENTER – Excel-tema.
 *   Tar ren data (ReportSheet[]) fra rapportmodulene og lager ÉN pen
 *   arbeidsbok: forside med innholdsfortegnelse, og ett ark per ReportSheet
 *   med tittel, nøkkeltall-fliser og tabeller. Alt utseende bor her.
 *   Kolonne A er en smal «marg»; innholdet starter i kolonne B.
 * ===================================================================== */

const FONT = "Arial";
const INK = "FF211E1A";
const MUTED = "FF8A807A";
const ACCENT = "FFF47721";
const HAIRLINE = "FFE6E1DC";
const ZEBRA = "FFFAF8F6";
const TILE = "FFF6F3F0";
const WHITE = "FFFFFFFF";

/** Norske tallformat. */
const FMT: Record<ColType, string> = {
  text: "@",
  money: '#,##0 "kr";-#,##0 "kr";"–"',
  money2: '#,##0.00 "kr";-#,##0.00 "kr";"–"',
  int: '#,##0;-#,##0;"–"',
  decimal: "#,##0.0",
  pct: "0.0 %",
  date: "dd.mm.yyyy",
  datetime: "dd.mm.yyyy hh:mm",
};

/** Myke fanefarger per kategori. */
const TAB_COLOR: Record<ReportCategory, string> = {
  Omsetning: "FFF4B183",
  Barbere: "FFA9C4D6",
  Kasse: "FFB5D3B0",
  Kunder: "FFD5B8E0",
  Booking: "FFF0D68A",
  Varer: "FFC9B8A6",
  Lønn: "FFA8B8C9",
};

const CATEGORY_ORDER: ReportCategory[] = ["Omsetning", "Barbere", "Kasse", "Kunder", "Booking", "Varer", "Lønn"];

const GUTTER = 1; // kolonne A
const FIRST_COL = 2; // kolonne B

export type ReportWorkbookInput = {
  /** Tittel på forsiden og i filens egenskaper, f.eks. «Rapportpakke». */
  title: string;
  /** Lesbar periode, f.eks. «november 2026». */
  periodLabel: string;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  generatedBy?: string;
  sheets: {
    report: { title: string; category: ReportCategory };
    sheets: ReportSheet[];
  }[];
};

/* ---------- Hjelpere: tid og verdier ---------- */

const OSLO_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function osloParts(d: Date) {
  const p = Object.fromEntries(OSLO_PARTS.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, raw: p };
}

/** «YYYY-MM-DD» → Date kl. 12:00 UTC (unngår dato-skift pga. tidssone). */
function toDateCell(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0));
}

/** ISO (UTC) → Date der UTC-feltene viser Oslo-klokka (Excel har ingen tidssone). */
function toDateTimeCell(v: string): Date | null {
  const t = new Date(v);
  if (isNaN(t.getTime())) return null;
  const o = osloParts(t);
  return new Date(Date.UTC(o.y, o.mo - 1, o.d, o.h, o.mi, 0));
}

function generatedStamp(): string {
  const o = osloParts(new Date());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(o.d)}.${p(o.mo)}.${o.y} kl. ${p(o.h)}:${p(o.mi)}`;
}

function fmtDateNo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function num(v: Cell | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Verdi som skal inn i Excel-cella for en gitt kolonnetype. */
function cellValue(type: ColType, v: Cell | undefined): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  switch (type) {
    case "text":
      return String(v);
    case "date":
      return typeof v === "string" ? (toDateCell(v) ?? v) : null;
    case "datetime":
      return typeof v === "string" ? (toDateTimeCell(v) ?? v) : null;
    default:
      return num(v);
  }
}

/** Omtrentlig visningslengde, til kolonnebredde. */
function displayLen(type: ColType, v: Cell | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  switch (type) {
    case "text":
      return String(v).length;
    case "date":
      return 10;
    case "datetime":
      return 16;
    case "money":
      return (num(v) ?? 0).toLocaleString("nb-NO", { maximumFractionDigits: 0 }).length + 3;
    case "money2":
      return (num(v) ?? 0).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + 3;
    case "pct":
      return ((num(v) ?? 0) * 100).toFixed(1).length + 2;
    case "decimal":
      return (num(v) ?? 0).toLocaleString("nb-NO", { maximumFractionDigits: 1 }).length;
    default:
      return (num(v) ?? 0).toLocaleString("nb-NO", { maximumFractionDigits: 0 }).length;
  }
}

/* ---------- Hjelpere: arknavn og kolonner ---------- */

function sanitizeSheetName(raw: string, used: Set<string>): string {
  let base = raw.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "");
  if (!base) base = "Ark";
  base = base.slice(0, 31).trim();
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length).trim() + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/** A1-kolonnebokstav for 1-basert indeks. */
function colLetter(i: number): string {
  let s = "";
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const hair: Partial<ExcelJS.Border> = { style: "thin", color: { argb: HAIRLINE } };

/* ---------- Ark-bygging ---------- */

function buildSheet(ws: ExcelJS.Worksheet, sheet: ReportSheet) {
  const tables = sheet.tables;
  const kpis = sheet.kpis ?? [];

  // Antall innholdskolonner: bredeste tabell, minst 4, utvidet så KPI-flisene passer.
  const tableMax = Math.max(4, ...tables.map((t) => t.columns.length));
  const kpiPerRow = Math.min(Math.max(kpis.length, 1), tableMax >= 8 ? 4 : 3);
  const tileSpan = Math.max(1, Math.floor(tableMax / kpiPerRow));
  let ncols = tableMax;
  if (kpis.length) ncols = Math.max(ncols, kpiPerRow * tileSpan);
  const lastCol = FIRST_COL + ncols - 1;

  ws.views = [{ showGridLines: false, state: "normal" }];
  ws.getColumn(GUTTER).width = 2.5;

  // Standardfont på alle brukte celler settes underveis; bredder samles her.
  const widths: number[] = Array(ncols).fill(8);
  const bump = (idx: number, len: number) => {
    widths[idx] = Math.max(widths[idx], len + 3);
  };
  const notes: { row: number; text: string; from: number; to: number }[] = [];

  // Tittel (rad 1) + undertittel (rad 2) + aksentlinje
  const t1 = ws.getCell(1, FIRST_COL);
  t1.value = sheet.title;
  t1.font = { name: FONT, size: 18, bold: true, color: { argb: INK } };
  t1.alignment = { vertical: "middle" };
  ws.getRow(1).height = 32;
  for (let c = FIRST_COL; c <= lastCol; c++) {
    ws.getCell(1, c).border = { bottom: { style: "medium", color: { argb: ACCENT } } };
  }
  const t2 = ws.getCell(2, FIRST_COL);
  t2.value = sheet.subtitle ?? "";
  t2.font = { name: FONT, size: 10, color: { argb: MUTED } };
  t2.alignment = { vertical: "middle" };
  ws.getRow(2).height = 20;

  let row = 4;

  // KPI-fliser
  if (kpis.length) {
    for (let i = 0; i < kpis.length; i += kpiPerRow) {
      const chunk = kpis.slice(i, i + kpiPerRow);
      chunk.forEach((k, j) => drawTile(ws, row, FIRST_COL + j * tileSpan, tileSpan, k));
      ws.getRow(row).height = 20;
      ws.getRow(row + 1).height = 32;
      ws.getRow(row + 2).height = 18;
      row += 4; // 3 rader + luft
    }
    row += 0;
  }

  // Tabeller
  let singleHeaderRow = 0;
  let singleDataEnd = 0;
  let firstTableHasData = false;
  tables.forEach((t, ti) => {
    if (t.title) {
      const c = ws.getCell(row, FIRST_COL);
      c.value = t.title;
      c.font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
      c.alignment = { vertical: "middle" };
      ws.getRow(row).height = 22;
      row++;
    }
    const headerRow = row;
    const info = drawTable(ws, t, row, widths, bump, notes);
    row = info.nextRow;
    if (tables.length === 1 && ti === 0) {
      singleHeaderRow = headerRow;
      singleDataEnd = info.dataEnd;
      firstTableHasData = t.rows.length > 0;
    }
    row++; // blank rad mellom blokker
  });

  // Kolonnebredder: auto fra innhold; eksplisitt width = største på tvers av tabeller
  const finalW: number[] = [];
  for (let i = 0; i < ncols; i++) finalW.push(Math.min(50, Math.max(8, widths[i])));
  for (let i = 0; i < ncols; i++) {
    const explicit = Math.max(0, ...tables.map((t) => t.columns[i]?.width ?? 0));
    if (explicit) finalW[i] = explicit;
  }
  // KPI-fliser må ha nok bredde til tall og etikett
  if (kpis.length) {
    for (let j = 0; j < kpiPerRow; j++) {
      let need = 18;
      for (let k = j; k < kpis.length; k += kpiPerRow) {
        const kp = kpis[k];
        const vl = displayLen(kp.type, kp.value);
        need = Math.max(need, vl * 1.7 + 5, (kp.label.length + 3) * 0.95, ((kp.hint ?? "").length + 3) * 0.95);
      }
      const a = j * tileSpan;
      let sum = 0;
      for (let i = a; i < a + tileSpan; i++) sum += finalW[i];
      if (sum < need) for (let i = a; i < a + tileSpan; i++) finalW[i] += (need - sum) / tileSpan;
    }
  }
  for (let i = 0; i < ncols; i++) ws.getColumn(FIRST_COL + i).width = finalW[i];
  // Notater: høyde ut fra tekstlengde og samlet bredde
  for (const n of notes) {
    let w = 0;
    for (let i = n.from; i <= n.to; i++) w += finalW[i - FIRST_COL] ?? 8;
    const lines = Math.max(1, Math.ceil(n.text.length / Math.max(10, w * 1.1)));
    ws.getRow(n.row).height = lines * 12.5 + 4;
  }

  // Fryst rad + autofilter for enkelt-tabell-ark
  if (tables.length === 1 && singleHeaderRow > 0) {
    if (singleHeaderRow <= 12) {
      ws.views = [{ showGridLines: false, state: "frozen", ySplit: singleHeaderRow, xSplit: 0 }];
    }
    if (firstTableHasData) {
      const n = tables[0].columns.length;
      ws.autoFilter = {
        from: { row: singleHeaderRow, column: FIRST_COL },
        to: { row: singleDataEnd, column: FIRST_COL + n - 1 },
      };
    }
  }

  // Utskrift
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: ncols > 6 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 },
    horizontalCentered: false,
  };
  if (tables.length === 1 && singleHeaderRow > 0) {
    ws.pageSetup.printTitlesRow = `${singleHeaderRow}:${singleHeaderRow}`;
  }
  ws.headerFooter = {
    oddFooter: `&L&8Downtown Barbers · ${ws.name.replace(/&/g, "&&")}&R&8Side &P av &N`,
  };
}

function drawTile(ws: ExcelJS.Worksheet, row: number, col: number, span: number, k: Kpi) {
  const end = col + span - 1;
  const fill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: TILE } };
  const sep: Partial<ExcelJS.Borders> = {
    left: { style: "medium", color: { argb: WHITE } },
    right: { style: "medium", color: { argb: WHITE } },
  };
  for (let r = row; r < row + 3; r++) {
    for (let c = col; c <= end; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = fill;
      cell.border = sep;
    }
    if (span > 1) ws.mergeCells(r, col, r, end);
  }
  const label = ws.getCell(row, col);
  label.value = k.label;
  label.font = { name: FONT, size: 9, color: { argb: MUTED } };
  label.alignment = { vertical: "bottom", horizontal: "left", indent: 1 };

  const val = ws.getCell(row + 1, col);
  val.value = k.value === null || k.value === undefined ? null : k.value;
  val.numFmt = FMT[k.type];
  val.font = { name: FONT, size: 16, bold: true, color: { argb: INK } };
  val.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const hint = ws.getCell(row + 2, col);
  hint.value = k.hint ?? "";
  hint.font = { name: FONT, size: 9, color: { argb: MUTED } };
  hint.alignment = { vertical: "top", horizontal: "left", indent: 1 };
}

function drawTable(
  ws: ExcelJS.Worksheet,
  t: Table,
  startRow: number,
  widths: number[],
  bump: (idx: number, len: number) => void,
  notes: { row: number; text: string; from: number; to: number }[],
): { nextRow: number; dataEnd: number } {
  const cols = t.columns;
  const n = cols.length;
  const lastCol = FIRST_COL + n - 1;

  // Header: mørk tekst på varm lys bunn, aksent-linje under
  const hr = ws.getRow(startRow);
  hr.height = 24;
  cols.forEach((c, i) => {
    const cell = ws.getCell(startRow, FIRST_COL + i);
    cell.value = c.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TILE } };
    cell.alignment = { vertical: "middle", horizontal: isNumeric(c.type) ? "right" : "left", indent: 1, wrapText: false };
    cell.border = { bottom: { style: "medium", color: { argb: ACCENT } } };
    bump(i, c.header.length + 1);
  });

  let r = startRow + 1;
  const dataStart = r;

  if (t.rows.length === 0) {
    ws.mergeCells(r, FIRST_COL, r, lastCol);
    const c = ws.getCell(r, FIRST_COL);
    c.value = "Ingen data i perioden";
    c.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(r).height = 24;
    for (let i = 0; i < n; i++) ws.getCell(r, FIRST_COL + i).border = { bottom: hair };
    r++;
  } else {
    t.rows.forEach((rowData, ri) => {
      const wsRow = ws.getRow(r);
      wsRow.height = 18;
      cols.forEach((c, i) => {
        const cell = ws.getCell(r, FIRST_COL + i);
        const raw = rowData[c.key];
        cell.value = cellValue(c.type, raw);
        cell.numFmt = FMT[c.type];
        cell.font = { name: FONT, size: 10, color: { argb: INK } };
        cell.alignment = {
          vertical: "middle",
          horizontal: isNumeric(c.type) ? "right" : "left",
          indent: 1,
        };
        cell.border = { bottom: hair };
        if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
        bump(i, displayLen(c.type, raw));
      });
      r++;
    });
  }
  const dataEnd = r - 1;

  // Sum-rad med SUBTOTAL (regner om ved filtrering)
  const hasTotals = t.rows.length > 0 && cols.some((c) => c.total);
  if (hasTotals) {
    ws.getRow(r).height = 22;
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, FIRST_COL + i);
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TILE } };
      cell.border = { top: { style: "thin", color: { argb: INK } } };
      cell.alignment = { vertical: "middle", horizontal: isNumeric(c.type) ? "right" : "left", indent: 1 };
      cell.numFmt = c.total === "count" ? FMT.int : FMT[c.type];
      if (c.total && i > 0) {
        const code = c.total === "sum" ? 109 : c.total === "avg" ? 101 : 103;
        const L = colLetter(FIRST_COL + i);
        const vals = t.rows.map((x) => num(x[c.key])).filter((v): v is number => v !== null);
        const nonEmpty = t.rows.filter((x) => x[c.key] !== null && x[c.key] !== undefined && x[c.key] !== "").length;
        const result =
          c.total === "sum"
            ? vals.reduce((a, b) => a + b, 0)
            : c.total === "avg"
              ? vals.length
                ? vals.reduce((a, b) => a + b, 0) / vals.length
                : 0
              : nonEmpty;
        cell.value = { formula: `SUBTOTAL(${code},${L}${dataStart}:${L}${dataEnd})`, result };
        bump(i, displayLen(c.total === "count" ? "int" : c.type, result) + 1);
      }
    });
    // «Totalt» alltid i første kolonne (uten formel der)
    const c0 = ws.getCell(r, FIRST_COL);
    c0.value = "Totalt";
    c0.numFmt = "@";
    c0.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    r++;
  }

  if (t.note) {
    if (n > 1) ws.mergeCells(r, FIRST_COL, r, lastCol);
    const c = ws.getCell(r, FIRST_COL);
    c.value = t.note;
    c.font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    notes.push({ row: r, text: t.note, from: FIRST_COL, to: lastCol });
    r++;
  }

  return { nextRow: r, dataEnd };
}

function isNumeric(t: ColType): boolean {
  return t === "int" || t === "decimal" || t === "money" || t === "money2" || t === "pct";
}

/* ---------- Forside ---------- */

type IndexItem = { category: ReportCategory; reportTitle: string; sheetName: string };

function buildCover(ws: ExcelJS.Worksheet, opts: ReportWorkbookInput, items: IndexItem[]) {
  ws.views = [{ showGridLines: false }];
  ws.getColumn(GUTTER).width = 4;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 46;
  ws.getColumn(4).width = 4;
  const font = (size: number, extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
    name: FONT,
    size,
    color: { argb: INK },
    ...extra,
  });

  ws.getRow(2).height = 14;
  const brand = ws.getCell("B2");
  brand.value = "DOWNTOWN BARBERS";
  brand.font = font(10, { bold: true, color: { argb: ACCENT } });

  ws.getRow(3).height = 40;
  const title = ws.getCell("B3");
  title.value = opts.title;
  title.font = font(26, { bold: true });
  title.alignment = { vertical: "middle" };
  for (const c of [2, 3]) ws.getCell(3, c).border = { bottom: { style: "medium", color: { argb: ACCENT } } };

  const periodRange = `${fmtDateNo(opts.from)} – ${fmtDateNo(opts.to)}`;
  const meta: [string, string][] = [
    ["Periode", opts.periodLabel ? `${opts.periodLabel}  (${periodRange})` : periodRange],
    ["Opprettet", generatedStamp() + (opts.generatedBy ? ` av ${opts.generatedBy}` : "")],
  ];
  let r = 5;
  for (const [k, v] of meta) {
    ws.getCell(r, 2).value = k;
    ws.getCell(r, 2).font = font(10, { color: { argb: MUTED } });
    ws.getCell(r, 3).value = v;
    ws.getCell(r, 3).font = font(11);
    ws.getRow(r).height = 20;
    r++;
  }

  r += 1;
  const h = ws.getCell(r, 2);
  h.value = "Innhold";
  h.font = font(14, { bold: true });
  ws.getRow(r).height = 26;
  r++;

  const cats = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  for (const cat of cats) {
    r++;
    const ch = ws.getCell(r, 2);
    ch.value = cat.toUpperCase();
    ch.font = font(9, { bold: true, color: { argb: MUTED } });
    for (const c of [2, 3]) ws.getCell(r, c).border = { bottom: hair };
    ws.getRow(r).height = 18;
    r++;
    for (const it of items.filter((i) => i.category === cat)) {
      const link = ws.getCell(r, 2);
      link.value = { text: it.sheetName, hyperlink: `#'${it.sheetName.replace(/'/g, "''")}'!A1` };
      link.font = font(10, { color: { argb: "FF1F5FA8" }, underline: true });
      const rep = ws.getCell(r, 3);
      rep.value = it.reportTitle;
      rep.font = font(10, { color: { argb: MUTED } });
      ws.getRow(r).height = 19;
      r++;
    }
  }

  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = { oddFooter: "&L&8Downtown Barbers&R&8Side &P av &N" };
}

/* ---------- Offentlig API ---------- */

/* ---- Hvitt «papir» ----
 * Excel i mørk modus tegner celler UTEN egen fyllfarge svarte, mens teksten
 * vår er mørk → arket ser helt svart ut. Derfor får hvert ark eksplisitt
 * hvit bakgrunn: kolonnestil (gjelder også tomme celler) + alle celler som
 * ikke har egen farge. */
const PAPER: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
const PAPER_COLS = 40;

/** Kalles FØR innhold tegnes: nye celler arver hvit kolonnestil. */
function paperColumns(ws: ExcelJS.Worksheet) {
  for (let c = 1; c <= PAPER_COLS; c++) ws.getColumn(c).fill = PAPER;
}

/** Kalles ETTER innhold: celler som fikk stilen overskrevet uten fyll blir hvite. */
function paperCells(ws: ExcelJS.Worksheet) {
  // Bare brukte celler – resten dekkes av kolonnestilen (holder fila liten).
  const maxCol = ws.columnCount;
  const maxRow = ws.rowCount;
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      const f = cell.fill as ExcelJS.FillPattern | undefined;
      if (!f || f.pattern === "none") cell.fill = PAPER;
    }
  }
}

/** Lager hele rapport-arbeidsboka (forside + ett ark per ReportSheet). */
export async function renderReportWorkbook(opts: ReportWorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Downtown Barbers";
  wb.lastModifiedBy = "Downtown Barbers";
  wb.title = opts.title;
  wb.company = "Downtown Barbers AS";
  wb.created = new Date();
  wb.modified = new Date();

  const used = new Set<string>(["forside"]);
  const cover = wb.addWorksheet("Forside", { properties: { tabColor: { argb: ACCENT } } });
  paperColumns(cover);

  const items: IndexItem[] = [];
  for (const group of opts.sheets) {
    for (const sheet of group.sheets) {
      const name = sanitizeSheetName(sheet.name || sheet.title, used);
      const ws = wb.addWorksheet(name, {
        properties: { tabColor: { argb: TAB_COLOR[group.report.category] ?? ACCENT } },
      });
      paperColumns(ws);
      buildSheet(ws, sheet);
      paperCells(ws);
      items.push({ category: group.report.category, reportTitle: group.report.title, sheetName: name });
    }
  }

  buildCover(cover, opts, items);
  paperCells(cover);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export type { Column };
