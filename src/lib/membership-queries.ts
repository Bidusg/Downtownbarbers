import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * KUNDEKLUBB – utledede medlemsnivåer (Bronse/Sølv/Gull).
 *   Nivået utledes av forbruk (sum sales.total_nok) og fullførte besøk
 *   (bookings.status='completed'). Konfigurerbare terskler ligger i
 *   membership_tiers. All lesing er defensiv: tomt/null ved feil.
 *
 *   NIVÅ-REGEL: høyeste nivå der spend >= min_spend ELLER visits >= min_visits.
 * ===================================================================== */

export type MembershipTier = {
  id: number;
  name: string;
  minSpend: number;
  minVisits: number;
  benefit: string | null;
  color: string | null;
};

export type CustomerMembership = {
  tierId: number;
  tierName: string;
  benefit: string | null;
  color: string | null;
  spend: number;
  visits: number;
  nextTierName: string | null;
  nextMinSpend: number | null;
  nextMinVisits: number | null;
};

type MembershipRpcRow = {
  tier_id: number | null;
  tier_name: string | null;
  benefit: string | null;
  color: string | null;
  spend: number | string | null;
  visits: number | null;
  next_tier_name: string | null;
  next_min_spend: number | string | null;
  next_min_visits: number | null;
};

function mapMembership(row: MembershipRpcRow | null | undefined): CustomerMembership | null {
  if (!row || row.tier_id == null) return null;
  return {
    tierId: Number(row.tier_id),
    tierName: row.tier_name ?? "—",
    benefit: row.benefit ?? null,
    color: row.color ?? null,
    spend: Math.round(Number(row.spend) || 0),
    visits: Number(row.visits) || 0,
    nextTierName: row.next_tier_name ?? null,
    nextMinSpend: row.next_min_spend == null ? null : Number(row.next_min_spend),
    nextMinVisits: row.next_min_visits == null ? null : Number(row.next_min_visits),
  };
}

/** Kundens nivå + grunnlag (admin/kundekort som kjenner kunde-id). */
export async function getCustomerMembership(
  customerId: string,
): Promise<CustomerMembership | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("customer_membership", { p_customer: customerId });
    const row = (Array.isArray(data) ? data[0] : data) as MembershipRpcRow | null;
    return mapMembership(row);
  } catch {
    return null;
  }
}

/** Kundens eget nivå via portal_token (anonym «min side» — kjenner ikke kunde-id). */
export async function getCustomerMembershipByToken(
  token: string,
): Promise<CustomerMembership | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("customer_membership_by_token", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as MembershipRpcRow | null;
    return mapMembership(row);
  } catch {
    return null;
  }
}

/** Alle nivåene (til admin-config og oversikt). */
export async function getMembershipTiers(): Promise<MembershipTier[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("membership_tiers")
      .select("id, name, min_spend, min_visits, benefit, color")
      .order("id", { ascending: true });
    return (data ?? []).map((t) => ({
      id: Number(t.id),
      name: t.name as string,
      minSpend: Number(t.min_spend) || 0,
      minVisits: Number(t.min_visits) || 0,
      benefit: (t.benefit as string | null) ?? null,
      color: (t.color as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export type MembershipCount = { tierId: number; name: string; count: number };

/**
 * Antall kunder per nivå (admin-oversikt). Bygger på samme grunnlag som
 * customer_membership (sales + fullførte bookings), aggregert i minne.
 * Hver kunde havner på sitt HØYESTE oppnådde nivå. Defensivt: tomt ved feil.
 */
export async function getMembershipCounts(): Promise<MembershipCount[]> {
  try {
    const sb = await createClient();
    const [tiersRes, salesRes, bookRes, custRes] = await Promise.all([
      sb
        .from("membership_tiers")
        .select("id, name, min_spend, min_visits")
        .order("id", { ascending: true }),
      sb
        .from("sales")
        .select("customer_id, total_nok")
        .not("customer_id", "is", null)
        .limit(100000),
      sb
        .from("bookings")
        .select("customer_id")
        .eq("status", "completed")
        .not("customer_id", "is", null)
        .limit(100000),
      sb.from("customers").select("id").limit(100000),
    ]);

    const tiers = (tiersRes.data ?? []).map((t) => ({
      id: Number(t.id),
      name: t.name as string,
      minSpend: Number(t.min_spend) || 0,
      minVisits: Number(t.min_visits) || 0,
    }));
    if (tiers.length === 0) return [];

    const spend = new Map<string, number>();
    for (const s of salesRes.data ?? []) {
      const cid = s.customer_id as string;
      spend.set(cid, (spend.get(cid) ?? 0) + (Number(s.total_nok) || 0));
    }
    const visits = new Map<string, number>();
    for (const b of bookRes.data ?? []) {
      const cid = b.customer_id as string;
      visits.set(cid, (visits.get(cid) ?? 0) + 1);
    }

    const counts = new Map<number, number>();
    for (const c of custRes.data ?? []) {
      const cid = c.id as string;
      const sp = spend.get(cid) ?? 0;
      const vi = visits.get(cid) ?? 0;
      // Høyeste nivå der spend >= min_spend ELLER visits >= min_visits.
      let chosen = tiers[0].id;
      for (const t of tiers) {
        if (sp >= t.minSpend || vi >= t.minVisits) chosen = t.id;
      }
      counts.set(chosen, (counts.get(chosen) ?? 0) + 1);
    }

    return tiers.map((t) => ({ tierId: t.id, name: t.name, count: counts.get(t.id) ?? 0 }));
  } catch {
    return [];
  }
}

/**
 * Hva som mangler til neste nivå (kr / besøk). Siden regelen er ELLER, holder
 * det å oppfylle ETT av kravene. Null hvis toppnivå er nådd.
 */
export function remainingToNext(
  m: CustomerMembership,
): { spendLeft: number; visitsLeft: number } | null {
  if (!m.nextTierName) return null;
  return {
    spendLeft: Math.max(0, Math.round((m.nextMinSpend ?? 0) - m.spend)),
    visitsLeft: Math.max(0, (m.nextMinVisits ?? 0) - m.visits),
  };
}
