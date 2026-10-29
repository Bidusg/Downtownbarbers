import { cookies } from "next/headers";
import { createPublicClient } from "@/lib/supabase/public";

/* =====================================================================
 * QR-TILBUD (KJØR-I-SUPABASE-QR-TILBUD.sql)
 *   Skanning av /q/<kode> lagrer koden i «dtb_promo» (httpOnly). Bookingen
 *   og nettbutikken leser den og legger på tilbudet. Tilbudet vises aldri
 *   uten koden. Alt faller stille tilbake til vanlig pris før SQL-en er kjørt.
 * ===================================================================== */

export const PROMO_COOKIE = "dtb_promo";

export type Promo = {
  slug: string;
  label: string;
  headline: string | null;
  body: string | null;
  servicePct: number;
  friendPct: number;
  productPct: number;
  bookBy: string | null;
  visitBy: string | null;
  productsUntil: string | null;
  bookingOpen: boolean;
  productsOpen: boolean;
};

const SLUG = /^[a-z0-9-]{3,40}$/i;
export const isPromoSlug = (s: string | null | undefined): s is string => !!s && SLUG.test(s);

function parse(d: unknown): Promo | null {
  if (!d || typeof d !== "object") return null;
  const r = d as Record<string, unknown>;
  return {
    slug: String(r.slug ?? ""),
    label: String(r.label ?? ""),
    headline: (r.headline as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    servicePct: Number(r.service_pct) || 0,
    friendPct: Number(r.friend_pct) || 0,
    productPct: Number(r.product_pct) || 0,
    bookBy: (r.book_by as string | null) ?? null,
    visitBy: (r.visit_by as string | null) ?? null,
    productsUntil: (r.products_until as string | null) ?? null,
    bookingOpen: r.booking_open === true,
    productsOpen: r.products_open === true,
  };
}

/** Kode fra informasjonskapselen (server). */
export async function getPromoSlug(): Promise<string | null> {
  try {
    const v = (await cookies()).get(PROMO_COOKIE)?.value;
    return isPromoSlug(v) ? v : null;
  } catch {
    return null;
  }
}

/** Aktivt tilbud for denne besøkende (null = ingen / utløpt). */
export async function getActivePromo(): Promise<Promo | null> {
  const slug = await getPromoSlug();
  if (!slug) return null;
  try {
    const { data, error } = await createPublicClient().rpc("promo_public", { p_slug: slug });
    if (error) return null;
    return parse(data);
  } catch {
    return null;
  }
}

/** Skanning: teller og returnerer tilbudet. */
export async function scanPromo(slug: string): Promise<Promo | null> {
  if (!isPromoSlug(slug)) return null;
  try {
    const { data, error } = await createPublicClient().rpc("promo_scan", { p_slug: slug });
    if (error) return null;
    return parse(data);
  } catch {
    return null;
  }
}

/** 2026-11-30 → «30. november». */
export function promoDate(iso: string | null, en = false): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(en ? "en-GB" : "nb-NO", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
