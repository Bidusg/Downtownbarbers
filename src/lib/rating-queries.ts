import { createClient } from "@/lib/supabase/server";
import { getStaffOptions } from "@/lib/ops-queries";

/* =====================================================================
 * RATING – lesespørringer (admin/revisor).
 *   Leser ekte data fra ratings-tabellen (fylles av rate_booking-RPC
 *   når kunder vurderer via /vurder/[id]). Defensivt: tomt ved feil.
 * ===================================================================== */

export type BarberRating = {
  staffId: string;
  name: string;
  avg: number; // 0–5
  count: number;
};

export type RatingComment = {
  id: string;
  barber: string;
  stars: number;
  text: string;
  createdAt: string;
};

export type RatingOverview = {
  perBarber: BarberRating[];
  comments: RatingComment[];
  totalAvg: number;
  totalCount: number;
};

export async function getRatingOverview(): Promise<RatingOverview> {
  const empty: RatingOverview = {
    perBarber: [],
    comments: [],
    totalAvg: 0,
    totalCount: 0,
  };
  try {
    const sb = await createClient();
    const [staff, ratingsRes] = await Promise.all([
      getStaffOptions(),
      sb
        .from("ratings")
        .select("id, staff_id, stars, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(100000),
    ]);

    const rows = ratingsRes.data ?? [];
    const nameById = new Map(staff.map((s) => [s.id, s.full_name]));

    const agg = new Map<string, { sum: number; n: number }>();
    let sumAll = 0;
    let nAll = 0;
    for (const r of rows) {
      const stars = Number(r.stars) || 0;
      sumAll += stars;
      nAll++;
      const sid = r.staff_id as string | null;
      if (sid) {
        const a = agg.get(sid) ?? { sum: 0, n: 0 };
        a.sum += stars;
        a.n++;
        agg.set(sid, a);
      }
    }

    const perBarber: BarberRating[] = staff
      .map((s) => {
        const a = agg.get(s.id);
        return {
          staffId: s.id,
          name: s.full_name,
          avg: a && a.n ? a.sum / a.n : 0,
          count: a?.n ?? 0,
        };
      })
      .filter((b) => b.count > 0)
      .sort((a, b) => b.avg - a.avg);

    const comments: RatingComment[] = rows
      .filter((r) => ((r.comment as string) ?? "").trim())
      .slice(0, 8)
      .map((r) => ({
        id: r.id as string,
        barber: nameById.get(r.staff_id as string) ?? "—",
        stars: Number(r.stars) || 0,
        text: (r.comment as string).trim(),
        createdAt: r.created_at as string,
      }));

    return {
      perBarber,
      comments,
      totalAvg: nAll ? sumAll / nAll : 0,
      totalCount: nAll,
    };
  } catch {
    return empty;
  }
}
