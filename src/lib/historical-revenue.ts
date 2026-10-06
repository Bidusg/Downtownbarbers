import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Historisk omsetning (importert fra gammelt kassesystem), per ansatt per
 * måned. Beløp inkl. mva. Tabellen: historical_staff_revenue.
 * Mangler tabellen (SQL ikke kjørt) → tom liste, alt annet virker som før.
 * En måned regnes med når dens 1. dag ligger i perioden [start, slutt).
 * ===================================================================== */

export type HistRow = {
  id: string;
  staffId: string;
  staffName: string;
  month: string; // YYYY-MM
  hours: number;
  visits: number;
  treatmentNok: number;
  productNok: number;
  totalNok: number;
  source: string | null;
};

export const HIST_METHOD_LABEL = "Importert (gammelt system)";

/** Oslo-dato (YYYY-MM-DD) for et ISO-tidspunkt. */
function osloDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

export async function getHistoricalRevenue(startIso: string, endIso: string): Promise<HistRow[]> {
  return getHistoricalRevenueByDate(osloDate(startIso), osloDate(endIso));
}

/** fromDate inkl., toDate eksl. (YYYY-MM-DD). */
export async function getHistoricalRevenueByDate(fromDate: string, toDate: string): Promise<HistRow[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("historical_staff_revenue")
      .select("id, staff_id, month, hours, visits, treatment_nok, product_nok, total_nok, source, staff(full_name)")
      .gte("month", fromDate)
      .lt("month", toDate)
      .order("month");
    if (error || !data) return [];
    return data.map((r) => ({
      id: r.id as string,
      staffId: r.staff_id as string,
      staffName: (r.staff as { full_name?: string } | null)?.full_name ?? "Ukjent",
      month: String(r.month).slice(0, 7),
      hours: Number(r.hours) || 0,
      visits: Number(r.visits) || 0,
      treatmentNok: Number(r.treatment_nok) || 0,
      productNok: Number(r.product_nok) || 0,
      totalNok: Number(r.total_nok) || 0,
      source: (r.source as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** For år/måned-sider (Lønn, Måloppnåelse). */
export async function getHistoricalForMonth(year: number, month: number): Promise<HistRow[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const n = new Date(Date.UTC(year, month, 1));
  const to = n.toISOString().slice(0, 10);
  return getHistoricalRevenueByDate(from, to);
}
