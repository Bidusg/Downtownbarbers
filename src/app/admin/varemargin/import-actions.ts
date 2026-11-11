"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/reports/fetch-all";
import { getProductCosts } from "@/app/admin/produkter/costs";
import {
  matchCostRows,
  parseCostSheet,
  type ImportProduct,
  type MatchResult,
} from "@/lib/cost-import";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COST = 100_000;
const CHUNK = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PreviewResult =
  | {
      ok: true;
      fileName: string;
      costHeader: string;
      rowCount: number;
      warnings: string[];
      result: MatchResult;
    }
  | { ok: false; error: string };

export type ApplyItem = { product_id: string; cost: number; note?: string | null; isEstimate?: boolean };
export type ApplyResult = { saved: number; errors: string[]; warning?: string };

async function requireAdminOrError(): Promise<string | null> {
  const me = await getUserRole();
  if (!me) return "Du må logge inn.";
  if (!isAdminRole(me.role)) return "Ingen tilgang.";
  return null;
}

/* ---------- lesing av fil ---------- */

function plainCell(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
    if ("result" in o) return plainCell(o.result);
    if (typeof o.text === "string") return o.text;
    if ("error" in o) return null;
    return null;
  }
  return v;
}

function sheetRows(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  const total = Math.min(ws.rowCount, MAX_ROWS + 50);
  for (let i = 1; i <= total; i++) {
    const vals = ws.getRow(i).values as unknown[];
    // exceljs: indeks 0 er tom, kolonner starter på 1.
    rows.push(Array.isArray(vals) ? vals.slice(1).map(plainCell) : []);
  }
  return rows;
}

async function readXlsx(buf: ArrayBuffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  for (const w of wb.worksheets) {
    if (w.rowCount > MAX_ROWS || w.columnCount > 100) {
      throw new Error(`Arket «${w.name}» er for stort (maks ${MAX_ROWS} rader og 100 kolonner).`);
    }
  }
  const preferred = wb.worksheets.find((w) => w.name.trim().toLowerCase() === "margin per vare");
  if (preferred) return sheetRows(preferred);
  for (const ws of wb.worksheets) {
    const rows = sheetRows(ws);
    if (parseCostSheet(rows.slice(0, 30)).costHeader) return rows;
  }
  return wb.worksheets[0] ? sheetRows(wb.worksheets[0]) : [];
}

function decodeCsv(buf: ArrayBuffer): string {
  // Norsk Excel lagrer ofte CSV som Windows-1252.
  const utf8 = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

function parseCsv(text: string): unknown[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const delim = semi >= comma && semi > 0 ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/* ---------- forhåndsvisning (ingen skriving) ---------- */

type ProdRow = {
  id: string;
  name: string;
  brand?: string | null;
  barcode: string | null;
  price_nok: number | string | null;
  stock: number | string | null;
};

async function loadProducts(): Promise<ImportProduct[]> {
  const sb = await createClient();
  const map = (r: ProdRow): ImportProduct => ({
    id: r.id,
    name: r.name,
    brand: r.brand ?? null,
    barcode: r.barcode,
    price_nok: Number(r.price_nok) || 0,
    stock: Number(r.stock) || 0,
  });
  try {
    const rows = await fetchAll<ProdRow>((from, to) =>
      sb
        .from("products")
        .select("id, name, brand, barcode, price_nok, stock")
        .or("is_gift_card.is.null,is_gift_card.eq.false")
        .order("id")
        .range(from, to)
        .returns<ProdRow[]>(),
    );
    return rows.map(map);
  } catch {
    const rows = await fetchAll<ProdRow>((from, to) =>
      sb
        .from("products")
        .select("id, name, barcode, price_nok, stock")
        .or("is_gift_card.is.null,is_gift_card.eq.false")
        .order("id")
        .range(from, to)
        .returns<ProdRow[]>(),
    );
    return rows.map(map);
  }
}

export async function previewCostImport(formData: FormData): Promise<PreviewResult> {
  const denied = await requireAdminOrError();
  if (denied) return { ok: false, error: denied };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Velg en fil (.xlsx eller .csv)." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Fila er for stor (maks 5 MB)." };
  const lower = file.name.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isCsv = lower.endsWith(".csv");
  if (!isXlsx && !isCsv) return { ok: false, error: "Bare .xlsx og .csv støttes." };

  let table: unknown[][];
  try {
    const buf = await file.arrayBuffer();
    table = isXlsx ? await readXlsx(buf) : parseCsv(decodeCsv(buf));
  } catch (e) {
    const big = e instanceof Error && /for stort/.test(e.message);
    return { ok: false, error: big ? (e as Error).message : "Kunne ikke lese fila. Er den en gyldig Excel/CSV-fil?" };
  }

  const parsed = parseCostSheet(table);
  if (parsed.rows.length === 0) {
    return { ok: false, error: parsed.warnings[0] ?? "Fant ingen rader med varer i fila." };
  }
  if (parsed.rows.length > MAX_ROWS) {
    return { ok: false, error: `For mange rader (${parsed.rows.length}). Maks ${MAX_ROWS}.` };
  }

  let products: ImportProduct[];
  try {
    products = await loadProducts();
  } catch (e) {
    return { ok: false, error: "Kunne ikke hente varer: " + (e instanceof Error ? e.message : "ukjent feil") };
  }
  const costs = await getProductCosts();
  const warnings = [...parsed.warnings];
  if (!costs.ok) warnings.push("Tabellen product_costs finnes ikke ennå – kjør KJØR-I-SUPABASE-INNKJOPSPRIS.sql før lagring.");

  return {
    ok: true,
    fileName: file.name,
    costHeader: parsed.costHeader,
    rowCount: parsed.rows.length,
    warnings,
    result: matchCostRows(parsed.rows, products, costs.costs),
  };
}

/* ---------- lagring ---------- */

const isMissingTable = (m: string) =>
  /product_costs/i.test(m) && /(does not exist|schema cache|could not find the table|relation)/i.test(m);
const isMissingMeta = (m: string) => /(cost_source|note)/i.test(m) && /(column|schema cache)/i.test(m);

export async function applyCostImport(items: ApplyItem[]): Promise<ApplyResult> {
  const denied = await requireAdminOrError();
  if (denied) return { saved: 0, errors: [denied] };
  if (!Array.isArray(items) || items.length === 0) return { saved: 0, errors: ["Ingen varer å lagre."] };
  if (items.length > MAX_ROWS) return { saved: 0, errors: [`For mange varer (maks ${MAX_ROWS}).`] };

  const errors: string[] = [];
  const clean = new Map<string, { product_id: string; cost_nok: number; cost_source: string; note: string | null }>();
  for (const it of items) {
    const id = typeof it?.product_id === "string" ? it.product_id : "";
    const cost = typeof it?.cost === "number" ? it.cost : NaN;
    if (!UUID.test(id)) {
      errors.push("Ugyldig vare-ID hoppet over.");
      continue;
    }
    if (!Number.isFinite(cost) || cost < 0 || cost > MAX_COST) {
      errors.push(`Ugyldig innkjøpspris for ${id} hoppet over.`);
      continue;
    }
    const note = typeof it.note === "string" ? it.note.trim().slice(0, 300) || null : null;
    clean.set(id, {
      product_id: id,
      cost_nok: Math.round((cost + Number.EPSILON) * 100) / 100,
      cost_source: it.isEstimate ? "anslag" : "import",
      note,
    });
  }
  if (clean.size === 0) return { saved: 0, errors };

  const sb = await createClient();
  let existingIds: Set<string>;
  try {
    const rows = await fetchAll<{ id: string }>((from, to) =>
      sb.from("products").select("id").order("id").range(from, to).returns<{ id: string }[]>(),
    );
    existingIds = new Set(rows.map((r) => r.id));
  } catch (e) {
    return { saved: 0, errors: ["Kunne ikke sjekke varer: " + (e instanceof Error ? e.message : "ukjent feil")] };
  }

  const valid = [...clean.values()].filter((r) => {
    if (existingIds.has(r.product_id)) return true;
    errors.push(`Vare ${r.product_id} finnes ikke – hoppet over.`);
    return false;
  });

  const { data: u } = await sb.auth.getUser();
  const now = new Date().toISOString();
  let saved = 0;
  let warning: string | undefined;
  let metaMissing = false;

  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const full = chunk.map((r) => ({ ...r, updated_at: now, updated_by: u.user?.id ?? null }));
    const slim = chunk.map((r) => ({
      product_id: r.product_id,
      cost_nok: r.cost_nok,
      updated_at: now,
      updated_by: u.user?.id ?? null,
    }));
    let { error } = await sb.from("product_costs").upsert(metaMissing ? slim : full, { onConflict: "product_id" });
    if (error && !metaMissing && isMissingMeta(error.message)) {
      metaMissing = true;
      warning = "Kjør KJØR-I-SUPABASE-PRISKALKULATOR.sql for å lagre kilde/merknad";
      ({ error } = await sb.from("product_costs").upsert(slim, { onConflict: "product_id" }));
    }
    if (error) {
      if (isMissingTable(error.message)) {
        errors.push("Tabellen product_costs finnes ikke. Kjør KJØR-I-SUPABASE-INNKJOPSPRIS.sql i Supabase først.");
        break;
      }
      errors.push(`Feil ved lagring (rad ${i + 1}–${i + chunk.length}): ${error.message}`);
      continue;
    }
    saved += chunk.length;
  }

  revalidatePath("/admin/varemargin");
  revalidatePath("/admin/produkter");
  return { saved, errors, warning };
}
