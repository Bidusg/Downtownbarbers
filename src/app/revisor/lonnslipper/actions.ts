"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, getUserRole } from "@/lib/auth";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-documents";
import { getPayrollForMonth } from "@/lib/payroll-slips";
import { renderPayslipPdf } from "@/components/revisor/PayslipDocument";
import { zipWithPassword } from "@/lib/zip";
import { sendPayslipEmail } from "@/lib/email";

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

const MONTHS_CAP = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

function portalUrl(): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://downtownbarbers.no";
  return `${site}/logg-inn`;
}

export type GeneratePayslipsResult = {
  ok?: true;
  generated?: number;
  emailed?: number;
  missingPostnummer?: string[];
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
  const monthLabel = `${MONTHS_CAP[month - 1] ?? String(month)} ${year}`;

  // Kontaktinfo (e-post + postnummer) for aktive ansatte – slås opp per ansatt
  // i løkka. `staff_public_read` gjør aktive ansattes rader lesbare server-side.
  const contactByStaff = new Map<
    string,
    { email: string | null; postnummer: string | null }
  >();
  {
    const { data: staffRows } = await sb
      .from("staff")
      .select("id, email, postnummer, active")
      .eq("active", true);
    for (const s of (staffRows as
      | { id: string; email: string | null; postnummer: string | null }[]
      | null) ?? []) {
      contactByStaff.set(s.id, {
        email: (s.email ?? "").trim() || null,
        postnummer: (s.postnummer ?? "").trim() || null,
      });
    }
  }

  let generated = 0;
  let emailed = 0;
  const missingPostnummer: string[] = [];
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

      // Utsending på e-post – best effort, velter ALDRI genereringen.
      try {
        const contact = contactByStaff.get(row.staffId);
        const email = contact?.email ?? null;
        const postnummer = contact?.postnummer ?? null;

        if (!postnummer) missingPostnummer.push(row.name);

        if (email) {
          if (postnummer) {
            // Passordbeskyttet ZIP – passord = postnummer.
            const zip = await zipWithPassword(
              buf,
              `Lonnslipp-${year}-${mm}.pdf`,
              postnummer,
            );
            const sent = await sendPayslipEmail({
              to: email,
              name: row.name,
              monthLabel,
              attachment: {
                filename: `Lonnslipp-${year}-${mm}.zip`,
                base64: zip.toString("base64"),
              },
              portalUrl: portalUrl(),
            });
            if (sent) emailed += 1;
          } else {
            // Mangler postnummer: send kun varsel + portal-lenke (uten vedlegg).
            const sent = await sendPayslipEmail({
              to: email,
              name: row.name,
              monthLabel,
              portalUrl: portalUrl(),
            });
            if (sent) emailed += 1;
          }
        }
      } catch (e) {
        console.error(`payslip email ${row.staffId}:`, e);
      }
    } catch (e) {
      console.error(`payslip render ${row.staffId}:`, e);
      errors.push(`${row.name}: generering feilet`);
    }
  }

  revalidatePath("/revisor/lonnslipper");

  if (generated === 0) {
    return { error: "Ingen lønnsoversikter ble generert.", errors };
  }
  return {
    ok: true,
    generated,
    emailed,
    missingPostnummer: missingPostnummer.length ? missingPostnummer : undefined,
    errors: errors.length ? errors : undefined,
  };
}
