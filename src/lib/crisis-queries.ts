import { createClient } from "@/lib/supabase/server";

export type CrisisRequestRow = {
  id: string;
  created_at: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  tier: string | null;
  service: string | null;
  wish_day: string | null;
  wish_time: string | null;
  note: string | null;
  status: "ny" | "ringt" | "booket" | "avvist";
};

/** Krisetime-forespørsler siste 14 dager (nyeste først). ready=false før SQL-en er kjørt. */
export async function getCrisisRequests(): Promise<{ rows: CrisisRequestRow[]; ready: boolean }> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("crisis_requests")
      .select("id, created_at, name, phone, email, tier, service, wish_day, wish_time, note, status")
      .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { rows: [], ready: false };
    return { rows: (data ?? []) as CrisisRequestRow[], ready: true };
  } catch {
    return { rows: [], ready: false };
  }
}

/** Antall åpne (ny/ringt) forespørsler – til banneret i kassa. */
export async function countOpenCrisisRequests(): Promise<number> {
  try {
    const sb = await createClient();
    const { count, error } = await sb
      .from("crisis_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["ny", "ringt"])
      .gte("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString());
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
