import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { DEFAULT_SETTINGS, type ShopProduct, type WebshopSettings } from "@/lib/shop-shared";

/* =====================================================================
 * NETTBUTIKK – lesing (server). Bare aktive produkter som er «online» og
 * har fått en nettadresse (slug). Gavekort selges i salongen.
 * ===================================================================== */

const BASE_COLS =
  "id, slug, name, web_name, brand, category, short_description, description, benefits, recommended_for, how_to_use, ingredients, size_label, hold_level, shine_level, price_nok, compare_at_price_nok, image_url, images, stock, featured, related_slugs, is_gift_card, web_sort";

// subcategory/tags kommer med KJØR-I-SUPABASE-NETTBUTIKK-KATEGORIER.sql.
const COLS = `${BASE_COLS}, subcategory, tags`;

type Row = Record<string, unknown>;

/**
 * Merket vises over navnet (som i de store butikkene), så «Reuzel - Fiber Gel»
 * blir «Fiber Gel» når merket er Reuzel. Gjelder bare når web_name er tomt.
 */
export function displayName(name: string, brand: string | null): string {
  const m = name.match(/^(.+?)\s*[-–]\s+(.+)$/);
  if (!m || !brand) return name;
  const key = (x: string) =>
    x
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const a = key(m[1]);
  const b = key(brand);
  if (!a || !b) return name;
  if (b.startsWith(a) || a === b) return m[2].trim().length < 4 ? name : m[2].trim();
  // «Depot No. 402 - …» → «No. 402 – …» (modellnummeret beholdes).
  if (a.startsWith(b) && /\d/.test(m[1])) {
    const firstWord = brand.trim().split(/\s+/)[0];
    const rest = m[1].trim().slice(firstWord.length).trim();
    return rest ? `${rest} – ${m[2].trim()}` : m[2].trim();
  }
  return name;
}

function map(r: Row): ShopProduct {
  const imgs = ((r.images as string[] | null) ?? []).filter(Boolean);
  const main = (r.image_url as string | null) ?? null;
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: ((r.web_name as string | null) ?? "").trim() || displayName(r.name as string, (r.brand as string | null) ?? null),
    brand: (r.brand as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    subcategory: (r.subcategory as string | null) ?? null,
    tags: ((r.tags as string[] | null) ?? []).filter(Boolean),
    short: (r.short_description as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    benefits: ((r.benefits as string[] | null) ?? []).filter(Boolean),
    recommendedFor: (r.recommended_for as string | null) ?? null,
    howToUse: (r.how_to_use as string | null) ?? null,
    ingredients: (r.ingredients as string | null) ?? null,
    size: (r.size_label as string | null) ?? null,
    hold: r.hold_level == null ? null : Number(r.hold_level),
    shine: r.shine_level == null ? null : Number(r.shine_level),
    price: Number(r.price_nok) || 0,
    compareAt: r.compare_at_price_nok == null ? null : Number(r.compare_at_price_nok),
    images: main && !imgs.includes(main) ? [main, ...imgs] : imgs.length ? imgs : main ? [main] : [],
    stock: Number(r.stock) || 0,
    featured: r.featured === true,
    popularity: 0,
    related: ((r.related_slugs as string[] | null) ?? []).filter(Boolean),
    isGiftCard: r.is_gift_card === true,
  };
}

/**
 * Solgte enheter per produkt siste 180 dager (kasse + nettbutikk – nettordrer
 * blir salg når de utleveres). Mellomlagres i en time, så lista oppdaterer
 * seg av seg selv etter hvert som vi selger.
 */
const salesByProduct = unstable_cache(
  async (): Promise<Record<string, number>> => {
    try {
      const svc = createServiceClient();
      const since = new Date(Date.now() - 180 * 86400000).toISOString();
      const out: Record<string, number> = {};
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await svc
          .from("sale_items")
          .select("ref_id, quantity, sales!inner(sold_at)")
          .eq("kind", "product")
          .not("ref_id", "is", null)
          .gte("sales.sold_at", since)
          .range(from, from + 999);
        if (error || !data?.length) break;
        for (const r of data as { ref_id: string; quantity: number }[]) out[r.ref_id] = (out[r.ref_id] ?? 0) + (Number(r.quantity) || 1);
        if (data.length < 1000) break;
      }
      return out;
    } catch {
      return {};
    }
  },
  ["shop-sales-by-product"],
  { revalidate: 3600 },
);

/** Lite, stabilt «tilfeldig» tall per produkt som bytter hver dag (0–1). */
function dailyJitter(id: string): number {
  const seed = `${id}:${new Date().toISOString().slice(0, 10)}`;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export async function getShopProducts(): Promise<ShopProduct[]> {
  const [list, sold] = await Promise.all([loadShopProducts(), salesByProduct()]);
  // Salg teller mest; favoritter får et lite løft; resten blandes tilfeldig
  // (til vi har nok salgsdata vil lista se tilfeldig ut – det er meningen).
  for (const p of list) p.popularity = (sold[p.id] ?? 0) * 10 + (p.featured ? 3 : 0) + dailyJitter(p.id) * 2;
  return list;
}

async function loadShopProducts(): Promise<ShopProduct[]> {
  try {
    const sb = await createClient();
    const run = (cols: string) =>
      sb
        .from("products")
        .select(cols)
        .eq("active", true)
        .eq("online", true)
        .eq("is_gift_card", false)
        .not("slug", "is", null)
        .order("web_sort", { ascending: true })
        .order("name", { ascending: true })
        .limit(1000);
    let { data, error } = await run(COLS);
    if (error && /subcategory|tags/.test(error.message)) ({ data, error } = await run(BASE_COLS));
    if (error) return [];
    return ((data ?? []) as unknown as Row[]).map(map);
  } catch {
    return [];
  }
}

export async function getShopProduct(slug: string): Promise<ShopProduct | null> {
  try {
    const sb = await createClient();
    const run = (cols: string) =>
      sb.from("products").select(cols).eq("slug", slug).eq("active", true).eq("online", true).maybeSingle();
    let { data, error } = await run(COLS);
    if (error && /subcategory|tags/.test(error.message)) ({ data, error } = await run(BASE_COLS));
    if (error || !data) return null;
    return map(data as unknown as Row);
  } catch {
    return null;
  }
}

export async function getWebshopSettings(): Promise<WebshopSettings> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("webshop_settings");
    if (error || !data) return { ...DEFAULT_SETTINGS, card: process.env.VIPPS_CARD_ENABLED === "1" };
    const d = data as Record<string, unknown>;
    return {
      live: d.live === true,
      shippingNok: Number(d.shipping_nok ?? DEFAULT_SETTINGS.shippingNok),
      freeOverNok: Number(d.free_over_nok ?? DEFAULT_SETTINGS.freeOverNok),
      pickup: d.pickup !== false,
      ship: d.ship !== false,
      payAtPickup: d.pay_at_pickup !== false,
      card: process.env.VIPPS_CARD_ENABLED === "1",
    };
  } catch {
    return { ...DEFAULT_SETTINGS, card: process.env.VIPPS_CARD_ENABLED === "1" };
  }
}

/** Admin/eier/kassa kan se (og teste) butikken før den åpnes for kunder. */
export async function canPreviewShop(): Promise<boolean> {
  const me = await getUserRole();
  return !!me && (isAdminRole(me.role) || me.role === "shop");
}

/** Er butikken åpen for denne brukeren (åpen for alle, eller forhåndsvisning)? */
export async function shopIsOpenFor(): Promise<boolean> {
  const s = await getWebshopSettings();
  return s.live || (await canPreviewShop());
}
