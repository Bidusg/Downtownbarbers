import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCustomerToken } from "@/lib/customer-session";
import { memberDiscountNok, type BookingMember } from "@/lib/member-shared";

export { memberDiscountNok, type BookingMember };

/* =====================================================================
 * KUNDEKLUBB-FORDELER (KJØR-I-SUPABASE-MEDLEMSFORDELER.sql)
 *   • getMemberProfile(): innlogget kunde → kontaktinfo + nivå + rabatt.
 *     Brukes av bookingen (ferdig utfylt + medlemspris + krisetime).
 *   • memberDiscountFor(): nivårabatten på en booket time, regnet
 *     server-side i kassa (tjeneste % + produkt %). Samme avrunding som
 *     kassa-skjermen, så summene alltid stemmer.
 *   Alt faller stille tilbake til «ingen rabatt» før SQL-en er kjørt.
 * ===================================================================== */

export type MemberProfile = {
  name: string;
  email: string;
  phone: string;
  tierId: number | null;
  tierName: string | null;
  servicePct: number;
  productPct: number;
  /** Tjenesterabatten gjelder bare man–fre med start før kl. 15. */
  serviceOffpeak: boolean;
  crisis: boolean;
};

export async function getMemberProfile(): Promise<MemberProfile | null> {
  const token = await getCustomerToken();
  if (!token) return null;
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("member_profile", { p_token: token });
    if (error || !data) return null;
    const d = data as Record<string, unknown>;
    return {
      name: String(d.full_name ?? ""),
      email: String(d.email ?? ""),
      phone: String(d.phone ?? ""),
      tierId: d.tier_id == null ? null : Number(d.tier_id),
      tierName: (d.tier_name as string | null) ?? null,
      servicePct: Number(d.service_pct) || 0,
      productPct: Number(d.product_pct) || 0,
      serviceOffpeak: d.service_offpeak !== false,
      crisis: d.crisis === true,
    };
  } catch {
    return null;
  }
}

/** Nivårabatt lagret på timen (null = ingen). */
export async function bookingMember(sb: SupabaseClient, bookingId: string): Promise<BookingMember | null> {
  try {
    const { data, error } = await sb
      .from("bookings")
      .select("member_tier, member_service_pct, member_product_pct")
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !data?.member_tier) return null;
    const s = Number(data.member_service_pct) || 0;
    const p = Number(data.member_product_pct) || 0;
    if (s <= 0 && p <= 0) return null;
    return { tier: String(data.member_tier), servicePct: s, productPct: p };
  } catch {
    return null;
  }
}

/** Server-side: rabatten for timen + produktene som selges nå. */
export async function memberDiscountFor(
  sb: SupabaseClient,
  bookingId: string,
  products: { id: string; qty: number }[],
): Promise<{ nok: number; tier: string | null }> {
  const m = await bookingMember(sb, bookingId);
  if (!m) return { nok: 0, tier: null };
  const { data: b } = await sb.from("bookings").select("price_nok").eq("id", bookingId).maybeSingle();
  const serviceNok = Number(b?.price_nok) || 0;
  let productNok = 0;
  const clean = products.filter((p) => p && p.id);
  if (clean.length && m.productPct > 0) {
    const { data: prods } = await sb.from("products").select("id, price_nok").in("id", clean.map((p) => p.id));
    const price = new Map((prods ?? []).map((p) => [p.id as string, Number(p.price_nok) || 0]));
    for (const p of clean) productNok += (price.get(p.id) ?? 0) * Math.max(1, Math.floor(p.qty || 1));
  }
  return { nok: memberDiscountNok(m, serviceNok, productNok), tier: m.tier };
}
