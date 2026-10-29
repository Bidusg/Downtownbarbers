import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { seoUrl } from "@/lib/site-url";

export type AdminPromo = {
  id: string;
  slug: string;
  name: string;
  label: string;
  headline: string | null;
  body: string | null;
  servicePct: number;
  friendPct: number;
  productPct: number;
  bookBy: string | null;
  visitBy: string | null;
  productsUntil: string | null;
  oncePerCustomer: boolean;
  active: boolean;
  scans: number;
  url: string;
  qrSvg: string;
  qrPng: string;
  stats: { bookings: number; people: number; completed: number; orders: number; orderNok: number };
};

/** Alle QR-tilbud med lenke, QR-kode og tall. null = SQL ikke kjørt. */
export async function getAdminPromos(): Promise<AdminPromo[] | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("promo_campaigns")
    .select(
      "id, slug, name, label, headline, body, service_pct, friend_pct, product_pct, book_by, visit_by, products_until, once_per_customer, active, scans",
    )
    .order("created_at", { ascending: false });
  if (error) return null;
  const { data: st } = await sb.rpc("promo_stats");
  const stats = new Map(
    ((st as Record<string, unknown>[] | null) ?? []).map((r) => [String(r.id), r]),
  );
  const base = seoUrl().replace(/\/$/, "");
  return Promise.all(
    (data ?? []).map(async (p) => {
      const url = `${base}/q/${p.slug}`;
      const s = stats.get(String(p.id));
      const opts = { margin: 1, errorCorrectionLevel: "M" as const };
      return {
        id: p.id as string,
        slug: p.slug as string,
        name: p.name as string,
        label: p.label as string,
        headline: (p.headline as string | null) ?? null,
        body: (p.body as string | null) ?? null,
        servicePct: Number(p.service_pct) || 0,
        friendPct: Number(p.friend_pct) || 0,
        productPct: Number(p.product_pct) || 0,
        bookBy: (p.book_by as string | null) ?? null,
        visitBy: (p.visit_by as string | null) ?? null,
        productsUntil: (p.products_until as string | null) ?? null,
        oncePerCustomer: !!p.once_per_customer,
        active: !!p.active,
        scans: Number(p.scans) || 0,
        url,
        qrSvg: await QRCode.toString(url, { ...opts, type: "svg" }),
        qrPng: await QRCode.toDataURL(url, { ...opts, width: 1200 }),
        stats: {
          bookings: Number(s?.bookings) || 0,
          people: Number(s?.booked_people) || 0,
          completed: Number(s?.completed) || 0,
          orders: Number(s?.orders) || 0,
          orderNok: Number(s?.order_nok) || 0,
        },
      };
    }),
  );
}
