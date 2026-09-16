import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =====================================================================
 * GRUNNDATA-EKSPORT – «Eksporter alt» (.xlsx)
 *   Full grunndata-eksport for Fixit-paritet: ett ark per kjernetabell.
 *   - Admin-beskyttet (samme sjekk som regnskaps-eksporten).
 *   - Pagineringssikkert: PostgREST gir maks 1000 rader per kall, så vi
 *     henter i sider med .range(from, to) til alt er hentet.
 *   - Robust: en tabell som ikke finnes (eller feiler) hopper vi elegant
 *     over med try/catch per ark – hele eksporten velter ikke.
 * ===================================================================== */

const ACCENT = "FFF47721";
const WHITE = "FFFFFFFF";

/** PostgREST returnerer maks 1000 rader per kall. */
const PAGE_SIZE = 1000;
/** Øvre sikkerhetsgrense per tabell (dokumentert), for å unngå å henge på
 *  en uventet enorm tabell. Hever ved behov. */
const MAX_ROWS = 500_000;

/**
 * Sikkerhet: hemmelige kolonner skal ALDRI havne i en nedlastbar fil.
 * Vi henter `*`, så vi filtrerer generisk på kolonnenavn – både kjente
 * felter (pin_hash, portal_token) og mønstre, så en framtidig hemmelig
 * kolonne heller ikke lekker.
 */
const SECRET_PATTERNS: RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /_hash$/i,
];

/** Sant hvis kolonnenavnet er hemmelig og må utelates fra eksporten. */
function isSecretColumn(name: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(name));
}

/**
 * Kjernetabellene vi eksporterer. `sheet` = norsk arknavn (Excel maks 31
 * tegn, ingen : \ / ? * [ ]). `columns` = kjente kolonnenavn fra migrasjonene
 * (0001_init + senere), brukt som fast, ekte overskriftsrekkefølge – og som
 * overskrifter selv når tabellen er tom. Vi henter likevel `*`, så nye
 * kolonner tas med automatisk (lagt til bakerst).
 */
const TABLES: { table: string; sheet: string; columns: string[] }[] = [
  {
    table: "customers",
    sheet: "Kunder",
    columns: [
      "id", "profile_id", "full_name", "phone", "email", "category", "notes",
      "first_visit", "created_at", "source", "marketing_consent",
      "marketing_consent_at",
    ],
  },
  {
    table: "bookings",
    sheet: "Bookinger",
    columns: [
      "id", "customer_id", "staff_id", "service_id", "start_at", "end_at",
      "status", "price_nok", "deposit_paid", "payment_provider", "payment_ref",
      "notes", "created_at", "reminder_sent_at",
    ],
  },
  {
    table: "sales",
    sheet: "Salg",
    columns: [
      "id", "booking_id", "staff_id", "customer_id", "total_nok", "sold_at",
      "payment_method",
    ],
  },
  {
    table: "services",
    sheet: "Tjenester",
    columns: [
      "id", "category_id", "name", "description", "price_nok", "duration_min",
      "active", "sort_order",
    ],
  },
  {
    table: "staff",
    sheet: "Ansatte",
    columns: [
      "id", "profile_id", "employee_number", "full_name", "title", "bio",
      "specialties", "photo_url", "contract_url", "phone", "email",
      "hire_date", "active", "created_at",
    ],
  },
  {
    table: "products",
    sheet: "Produkter",
    columns: [
      "id", "name", "description", "price_nok", "image_url", "stock", "active",
      "is_gift_card", "low_stock_threshold",
    ],
  },
  {
    table: "gift_cards",
    sheet: "Gavekort",
    columns: [
      "id", "code", "initial_nok", "balance_nok", "purchased_by", "created_at",
      "expires_at",
    ],
  },
  {
    table: "stock_movements",
    sheet: "Lagerbevegelser",
    columns: [
      "id", "product_id", "delta", "reason", "note", "new_stock", "created_by",
      "created_at",
    ],
  },
];

type Row = Record<string, unknown>;

/** Hent alle rader i en tabell, pagineret med .range() til alt er hentet. */
async function fetchAllRows(
  sb: Awaited<ReturnType<typeof createClient>>,
  table: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  let from = 0;
  // Stabil sortering på primærnøkkel (id finnes på alle kjernetabellene) gir
  // deterministisk paginering – ingen dupliserte/hoppede rader mellom sider.
  while (from < MAX_ROWS) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error; // manglende tabell e.l. -> fanges per ark
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break; // siste side
    from += PAGE_SIZE;
  }
  return rows;
}

/** Gjør en verdi trygg for en Excel-celle: primitiver som de er, objekter/
 *  arrays (jsonb, text[]) som JSON-tekst, null/undefined som tom streng. */
function toCell(v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return "";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") {
    return v as string | number | boolean;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Bygg ett ark for en tabell. Kaster videre ved feil (fanges av kaller). */
function addSheet(
  wb: ExcelJS.Workbook,
  sheet: string,
  knownColumns: string[],
  rows: Row[],
): void {
  // Overskrifter: kjente kolonner først (fast rekkefølge), så evt. nye
  // kolonner som dukker opp i data, lagt til bakerst.
  const headers = [...knownColumns];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!headers.includes(k)) headers.push(k);
    }
  }
  // Sikkerhet: strip hemmelige kolonner (pin_hash, portal_token, samt alt som
  // matcher token/secret/password/_hash) generisk – uansett kilde.
  const safeHeaders = headers.filter((h) => !isSecretColumn(h));

  const ws = wb.addWorksheet(sheet);
  ws.columns = safeHeaders.map((h) => ({
    header: h,
    key: h,
    width: Math.min(40, Math.max(12, h.length + 2)),
  }));

  // Overskriftsstil (samme uttrykk som regnskaps-arket: aksent + frosset).
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: WHITE } };
  head.height = 20;
  for (let i = 1; i <= safeHeaders.length; i++) {
    head.getCell(i).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: ACCENT },
    };
    head.getCell(i).alignment = { vertical: "middle" };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    const rowObj: Record<string, ExcelJS.CellValue> = {};
    for (const h of safeHeaders) rowObj[h] = toCell(r[h]);
    ws.addRow(rowObj);
  }
}

export async function GET() {
  // Admin-only: grunndata er en full PII-dump av alle kunder – kun admin.
  // (Samme requireRole-mekanisme som xlsx-routen, men strengere rolle.)
  await requireRole(["admin"]);

  const sb = await createClient();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Downtown Barbers";
  wb.created = new Date();

  const included: string[] = [];
  const skipped: string[] = [];

  for (const { table, sheet, columns } of TABLES) {
    try {
      const rows = await fetchAllRows(sb, table);
      addSheet(wb, sheet, columns, rows);
      included.push(sheet);
    } catch {
      // Tabellen finnes ikke / feilet – hopp elegant over dette arket.
      skipped.push(sheet);
    }
  }

  // exceljs krever minst ett ark; legg inn et info-ark dersom alt feilet.
  if (included.length === 0) {
    const info = wb.addWorksheet("Info");
    info.getColumn(1).width = 60;
    info.getCell("A1").value =
      "Ingen tabeller kunne eksporteres.";
    info.getCell("A1").font = { bold: true };
    if (skipped.length) {
      info.getCell("A2").value = `Hoppet over: ${skipped.join(", ")}`;
    }
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  }); // yyyy-mm-dd
  const buf = await wb.xlsx.writeBuffer();

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="downtown_grunndata_${today}.xlsx"`,
    },
  });
}
