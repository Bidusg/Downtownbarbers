"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, getUserRole } from "@/lib/auth";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-documents";
import { getPayrollForMonth } from "@/lib/payroll-slips";
import { renderPayslipPdf } from "@/components/revisor/PayslipDocument";

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

export type GeneratePayslipsResult = {
  ok?: true;
  generated?: number;
  error?: string;
  errors?: string[];
};

/**
 * Genererer (og re-genererer) lønnsoversikt-PDF for HVER aktiv ansatt for
 * gitt måned. Idempotent: stabil storage-path med upsert, og eksisterende
 * `staff_documents`-rad for (staff_id, period, category='lonnslipp') slettes
 * før ny insert (unikt indeks tillater maks én per ansatt per måned).
 * Ansatte med 0 omsetning får også lønnsoversikt (kun grunnlønn).
 */
export async function generatePayslips(
  year: number,
  month: number,
): Promise<GeneratePayslipsResult> {
  await requireRole(["revisor", "admin"]);
  const me = await getUserRole();
  if (!me) return { error: "Ikke innlogget." };

  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return { error: "Ugyldig år eller måned." };
  }

  const rows = await getPayrollForMonth(year, month);
  if (rows.length === 0) {
    return { error: "Ingen aktive ansatte funnet for perioden." };
  }

  const sb = await createClient();
  const mm = String(month).padStart(2, "0");
  const period = `${year}-${mm}`;
  const monthName = MONTHS[month - 1] ?? String(month);

  let generated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const buf = await renderPayslipPdf(row, year, month);
      const path = `${row.staffId}/lonnslipp-${year}-${mm}.pdf`;

      const { error: storageError } = await sb.storage
        .from(STAFF_DOCS_BUCKET)
        .upload(path, new Uint8Array(buf), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (storageError) {
        console.error(`payslip storage ${row.staffId}:`, storageError);
        errors.push(`${row.name}: opplasting feilet`);
        continue;
      }

      // Idempotent: fjern ev. eksisterende lønnslipp-rad for perioden før insert.
      await sb
        .from("staff_documents")
        .delete()
        .eq("staff_id", row.staffId)
        .eq("category", "lonnslipp")
        .eq("period", period);

      const { error: dbError } = await sb.from("staff_documents").insert({
        staff_id: row.staffId,
        category: "lonnslipp",
        name: `Lønnslipp ${monthName} ${year}`,
        path,
        period,
        size_bytes: buf.byteLength,
        mime: "application/pdf",
        uploaded_by: me.userId,
        by_staff: false,
      });
      if (dbError) {
        console.error(`payslip db ${row.staffId}:`, dbError);
        errors.push(`${row.name}: lagring av metadata feilet`);
        continue;
      }

      generated += 1;
    } catch (e) {
      console.error(`payslip render ${row.staffId}:`, e);
      errors.push(`${row.name}: generering feilet`);
    }
  }

  revalidatePath("/revisor/lonnslipper");

  if (generated === 0) {
    return { error: "Ingen lønnsoversikter ble generert.", errors };
  }
  return { ok: true, generated, errors: errors.length ? errors : undefined };
}
