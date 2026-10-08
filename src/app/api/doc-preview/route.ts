import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getUserRole } from "@/lib/auth";

/* =====================================================================
 * Excel-forhåndsvisning (server-side).
 *   Nettleseren kan ikke vise .xlsx/.xls nativt. Denne ruta tar en ALLEREDE
 *   signert Supabase-storage-URL (den samme UI-et bruker til nedlasting),
 *   henter fila server-side og parser arkene med exceljs → JSON.
 *
 *   Sikkerhet (ikke et åpent proxy-endepunkt):
 *     1) Krever innlogget bruker (anonyme avvises).
 *     2) URL-en MÅ peke på det konfigurerte Supabase-hosten OG være en
 *        signert storage-objekt-URL (/storage/v1/object/sign/…). Dermed kan
 *        ruta kun lese filer brukeren allerede har fått en tidsbegrenset
 *        signert lenke til via de eksisterende RLS-gatede query-lagene –
 *        ingen vilkårlige interne/eksterne URL-er (SSRF-vern).
 *
 *   Degraderer trygt: alltid { error } ved problem, så klienten kan falle
 *   tilbake til «last ned i stedet».
 * ===================================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Maks for en lett forhåndsvisning – store ark kuttes (last ned for alt).
const MAX_ROWS = 500;
const MAX_COLS = 60;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

type SheetJson = { name: string; rows: string[][]; truncated: boolean };

function supabaseHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || null;
  } catch {
    return null;
  }
}

/** Kun signerte storage-URL-er på vårt eget Supabase-host slippes gjennom. */
function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = supabaseHost();
  if (!host || u.host !== host) return false;
  // Signert objekt-URL fra Supabase Storage.
  return u.pathname.includes("/storage/v1/object/sign/");
}

/** Gjør en exceljs-celleverdi om til en ren streng for visning. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toLocaleDateString("nb-NO");
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Formel-celle: bruk utregnet resultat.
    if ("result" in v && v.result !== undefined && v.result !== null) {
      return cellToString(v.result);
    }
    // Hyperlenke.
    if ("text" in v && typeof v.text === "string") return v.text;
    // Rik tekst.
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[])
        .map((p) => p?.text ?? "")
        .join("");
    }
    // Delt formel / feil.
    if ("error" in v && typeof v.error === "string") return v.error;
    if ("hyperlink" in v && typeof v.hyperlink === "string") {
      return String(v.hyperlink);
    }
  }
  try {
    return String(value);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  // 1) Krev innlogget bruker.
  const me = await getUserRole();
  if (!me) {
    return NextResponse.json({ error: "Ikke innlogget." }, { status: 401 });
  }

  // 2) Les og valider URL.
  let url = "";
  try {
    const body = (await req.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url : "";
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json(
      { error: "Ikke en gyldig dokumentlenke." },
      { status: 400 },
    );
  }

  // 3) Hent fila og parse.
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Kunne ikke hente dokumentet." },
        { status: 502 },
      );
    }
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len && len > MAX_BYTES) {
      return NextResponse.json(
        { error: "Filen er for stor til forhåndsvisning." },
        { status: 413 },
      );
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Filen er for stor til forhåndsvisning." },
        { status: 413 },
      );
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab);

    const sheets: SheetJson[] = [];
    wb.eachSheet((ws) => {
      const rows: string[][] = [];
      let truncated = false;
      const colCount = Math.min(ws.columnCount || 0, MAX_COLS);
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > MAX_ROWS) {
          truncated = true;
          return;
        }
        const cells: string[] = [];
        for (let c = 1; c <= colCount; c++) {
          cells.push(cellToString(row.getCell(c).value));
        }
        // Trim trailing tomme celler for ryddigere tabell.
        while (cells.length && cells[cells.length - 1] === "") cells.pop();
        rows.push(cells);
      });
      if ((ws.rowCount || 0) > MAX_ROWS) truncated = true;
      sheets.push({ name: ws.name || `Ark ${sheets.length + 1}`, rows, truncated });
    });

    if (sheets.length === 0) {
      return NextResponse.json(
        { error: "Fant ingen ark i regnearket." },
        { status: 200 },
      );
    }
    return NextResponse.json({ sheets }, { status: 200 });
  } catch (err) {
    console.error("doc-preview parse failed:", err);
    return NextResponse.json(
      { error: "Kunne ikke lese regnearket." },
      { status: 200 },
    );
  }
}
