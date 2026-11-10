/* =====================================================================
 * Henter ALLE rader fra en Supabase-spørring.
 *   PostgREST gir maks 1000 rader per kall uansett .limit(), så vi henter
 *   i sider med .range(). Brukes av alle rapportmoduler.
 *
 *   const rows = await fetchAll((from, to) =>
 *     sb.from("sales").select("id, total_nok").gte(...).order("id").range(from, to));
 *
 *   Husk .order(...) på en entydig kolonne, ellers kan sider overlappe.
 * ===================================================================== */

const PAGE = 1000;
const MAX_ROWS = 500_000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Som fetchAll, men gir [] i stedet for å kaste (tabell/kolonne finnes ikke ennå). */
export async function fetchAllSafe<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  try {
    return await fetchAll(page);
  } catch {
    return [];
  }
}
