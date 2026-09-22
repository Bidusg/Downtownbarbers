import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * SESONG-KUPONGER til medlemmer (member_campaigns).
 *   Datadrevne rabattkuponger utstedt til klubbmedlemmer. Rabatten
 *   beregnes + valideres server-side ved innløsning i kassa. Her leser vi
 *   kupongene til admin-oversikten, med antall innløsninger.
 * ===================================================================== */

export type MemberCampaign = {
  id: string;
  name: string;
  description: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  minTierSortOrder: number;
  startsAt: string | null;
  expiresAt: string | null;
  oncePerMember: boolean;
  active: boolean;
  createdAt: string;
  redemptions: number;
};

export async function getMemberCampaigns(): Promise<MemberCampaign[]> {
  try {
    const sb = await createClient();
    const [campRes, redRes] = await Promise.all([
      sb
        .from("member_campaigns")
        .select(
          "id, name, description, discount_type, discount_value, min_tier_sort_order, starts_at, expires_at, once_per_member, active, created_at",
        )
        .order("created_at", { ascending: false }),
      sb.from("member_campaign_redemptions").select("campaign_id").limit(100000),
    ]);

    const counts = new Map<string, number>();
    for (const r of redRes.data ?? []) {
      const cid = r.campaign_id as string;
      counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }

    return (campRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      description: (c.description as string | null) ?? null,
      discountType: c.discount_type === "percent" ? "percent" : "fixed",
      discountValue: Number(c.discount_value) || 0,
      minTierSortOrder: Number(c.min_tier_sort_order) || 0,
      startsAt: (c.starts_at as string | null) ?? null,
      expiresAt: (c.expires_at as string | null) ?? null,
      oncePerMember: !!c.once_per_member,
      active: !!c.active,
      createdAt: c.created_at as string,
      redemptions: counts.get(c.id as string) ?? 0,
    }));
  } catch {
    return [];
  }
}
