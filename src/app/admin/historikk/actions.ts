"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { parseRevenueReport, type ParsedMonth } from "@/lib/historical-parse";

/* =====================================================================
 * Import av historisk omsetning per ansatt (PDF «Omsetning en ansatt»).
 *   1) parseHistoryPdf: les én PDF → ansatt + måneder (ingenting lagres).
 *   2) saveHistory: lagre de månedene admin har krysset av (upsert).
 * ===================================================================== */

export type PreviewMonth = ParsedMonth & {
  existing: boolean; // finnes allerede importert for denne ansatte/måneden
  liveSalesNok: number; // salg registrert i NYTT system samme måned
};

export type PdfPreview = {
  fileName: string;
  employee: string | null;
  staffId: string | null; // forslag (navnematch)
  months: PreviewMonth[];
  warnings: string[];
  error?: string;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function matchStaff(
  employee: string | null,
  staff: { id: string; full_name: string; display_name: string | null }[],
): string | null {
  if (!employee) return null;
  const e = norm(employee);
  const eTok = e.split(" ");
  const exact = staff.find((s) => norm(s.full_name) === e);
  if (exact) return exact.id;
  const all = staff.filter((s) => {
    const t = norm(s.full_name).split(" ");
    return eTok.every((x) => t.includes(x)) || t.every((x) => eTok.includes(x));
  });
  if (all.length === 1) return all[0].id;
  const first = staff.filter(
    (s) => norm(s.full_name).split(" ")[0] === eTok[0] || norm(s.display_name ?? "") === eTok[0],
  );
  return first.length === 1 ? first[0].id : null;
}

async function staffList(sb: Awaited<ReturnType<typeof createClient>>) {
  const r = await sb.from("staff").select("id, full_name, display_name");
  if (!r.error) return (r.data ?? []) as { id: string; full_name: string; display_name: string | null }[];
  const fb = await sb.from("staff").select("id, full_name");
  return ((fb.data ?? []) as { id: string; full_name: string }[]).map((s) => ({ ...s, display_name: null }));
}

/** Les én PDF og returner forhåndsvisning. */
export async function parseHistoryPdf(formData: FormData): Promise<PdfPreview> {
  await requireRole(["admin"]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { fileName: "", employee: null, staffId: null, months: [], warnings: [], error: "Ingen fil." };
  const base: PdfPreview = { fileName: file.name, employee: null, staffId: null, months: [], warnings: [] };
  if (file.size > 10 * 1024 * 1024) return { ...base, error: "Fila er over 10 MB." };

  let text = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const res = await extractText(pdf, { mergePages: true });
    text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
  } catch {
    return { ...base, error: "Klarte ikke å lese PDF-en (er det en skannet bildefil?)." };
  }

  const parsed = parseRevenueReport(text);
  const sb = await createClient();
  const staff = await staffList(sb);
  const staffId = matchStaff(parsed.employee, staff);

  // Merk måneder som allerede er importert, og som har salg i nytt system.
  const existing = new Set<string>();
  const live = new Map<string, number>();
  if (staffId && parsed.months.length) {
    const first = parsed.months[0].month + "-01";
    const lastM = parsed.months[parsed.months.length - 1].month;
    const [ly, lm] = lastM.split("-").map(Number);
    const end = new Date(Date.UTC(ly, lm, 1)).toISOString().slice(0, 10);
    const { data: ex } = await sb
      .from("historical_staff_revenue")
      .select("month")
      .eq("staff_id", staffId)
      .gte("month", first)
      .lt("month", end);
    (ex ?? []).forEach((r) => existing.add(String(r.month).slice(0, 7)));
    const { data: sales } = await sb
      .from("sales")
      .select("sold_at, total_nok")
      .eq("staff_id", staffId)
      .gte("sold_at", first)
      .lt("sold_at", end)
      .limit(100000);
    for (const s of sales ?? []) {
      const k = new Date(s.sold_at as string).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }).slice(0, 7);
      live.set(k, (live.get(k) ?? 0) + (Number(s.total_nok) || 0));
    }
  }

  return {
    ...base,
    employee: parsed.employee,
    staffId,
    warnings: parsed.warnings,
    months: parsed.months.map((m) => ({
      ...m,
      existing: existing.has(m.month),
      liveSalesNok: Math.round(live.get(m.month) ?? 0),
    })),
  };
}

export type SaveRow = ParsedMonth & { staffId: string; source: string };

/** Lagre valgte måneder (overskriver eksisterende for samme ansatt/måned). */
export async function saveHistory(rows: SaveRow[]): Promise<{ ok?: true; count?: number; error?: string }> {
  await requireRole(["admin"]);
  const clean = rows.filter((r) => r.staffId && /^\d{4}-\d{2}$/.test(r.month));
  if (clean.length === 0) return { error: "Ingen måneder valgt." };
  const sb = await createClient();
  const { error } = await sb.from("historical_staff_revenue").upsert(
    clean.map((r) => ({
      staff_id: r.staffId,
      month: r.month + "-01",
      hours: r.hours,
      visits: r.visits,
      treatment_nok: r.treatmentNok,
      product_nok: r.productNok,
      total_nok: r.totalNok,
      source: r.source.slice(0, 200),
      imported_at: new Date().toISOString(),
    })),
    { onConflict: "staff_id,month" },
  );
  if (error) {
    if (/historical_staff_revenue/.test(error.message))
      return { error: "Kjør KJØR-I-SUPABASE-HISTORISK-OMSETNING.sql i Supabase først." };
    return { error: `Kunne ikke lagre: ${error.message}` };
  }
  for (const p of ["/admin/historikk", "/admin/omsetning", "/admin/rapporter", "/admin/nokkeltall", "/admin/maloppnaelse", "/admin/lonn"])
    revalidatePath(p);
  return { ok: true, count: clean.length };
}

export async function deleteHistoryRow(id: string): Promise<void> {
  await requireRole(["admin"]);
  const sb = await createClient();
  await sb.from("historical_staff_revenue").delete().eq("id", id);
  revalidatePath("/admin/historikk");
}
