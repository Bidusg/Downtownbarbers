import type { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * FIXIT-HISTORIKK
 *   Historisk daglig omsetning importert fra Fixit (tabell
 *   fixit_turnover_daily). Blandes inn i trendgrafene sammen med ekte
 *   salg (sales) via et SKILLE-TIDSPUNKT, slik at ingenting telles dobbelt:
 *
 *     dag <= FIXIT_CUTOVER   → bruk Fixit-tallet
 *     dag  > FIXIT_CUTOVER   → bruk ekte salg fra kassa
 *
 *   FIXIT_CUTOVER er siste dagen i Fixit-eksporten. Eget system tar over
 *   dagen etter. Flytt denne datoen hvis dere importerer en nyere eksport.
 * ===================================================================== */

/** Siste dag dekket av Fixit-eksporten (yyyy-mm-dd, Oslo). */
export const FIXIT_CUTOVER = "2026-10-03";

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Daglige Fixit-totaler i [startKey, endKey] (begge yyyy-mm-dd, inklusive).
 * Map: dag-nøkkel (yyyy-mm-dd) → total omsetning (kr). Tom map ved feil.
 */
export async function getFixitDailyTotals(
  sb: SupabaseServer,
  startKey: string,
  endKey: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { data, error } = await sb
      .from("fixit_turnover_daily")
      .select("d, total_nok")
      .gte("d", startKey)
      .lte("d", endKey);
    if (error || !data) return out;
    for (const r of data as { d: string; total_nok: number | null }[]) {
      // d er en date (yyyy-mm-dd). Bruk de første 10 tegnene defensivt.
      const key = String(r.d).slice(0, 10);
      out.set(key, (out.get(key) ?? 0) + (Number(r.total_nok) || 0));
    }
  } catch {
    /* degraderer til tom map */
  }
  return out;
}
