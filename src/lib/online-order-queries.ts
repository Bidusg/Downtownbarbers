import { createClient } from "@/lib/supabase/server";

/* Nettordrer for kassa og admin (RLS: bare kasse/admin ser dem). */

export type OnlineOrder = {
  id: string;
  order_no: number;
  created_at: string;
  customer_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  delivery: "pickup" | "ship";
  address: string | null;
  postal_code: string | null;
  city: string | null;
  subtotal_nok: number;
  discount_nok: number;
  shipping_nok: number;
  total_nok: number;
  member_tier: string | null;
  payment_method: "vipps" | "card" | "pay_at_pickup";
  payment_status: string;
  status: "new" | "picking" | "ready" | "picked_up" | "shipped" | "cancelled";
  tracking_no: string | null;
  note: string | null;
  ready_at: string | null;
  completed_at: string | null;
  picking_started_at: string | null;
  /** Refundert til kunden (retur/reklamasjon). */
  refunded_nok: number;
  /** Beløpet kunden godkjente i Vipps (tak for endringer). */
  authorized_nok: number | null;
  items: OnlineOrderItem[];
};

export type OnlineOrderItem = {
  id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_price_nok: number;
  line_total_nok: number;
  picked_qty: number;
  missing_qty: number;
  returned_qty: number;
  barcode: string | null;
  image: string | null;
};

export type OrderEvent = {
  id: number;
  created_at: string;
  kind: string;
  text: string;
  amount_nok: number | null;
  by: string | null;
};

/** Hva databasen støtter (hvilke SQL-filer som er kjørt). */
export type OrderFeatures = { picking: boolean; returns: boolean };

const BASE =
  "id, order_no, created_at, customer_id, name, email, phone, delivery, address, postal_code, city, subtotal_nok, discount_nok, shipping_nok, total_nok, member_tier, payment_method, payment_status, status, tracking_no, note, ready_at, completed_at";

const COLS_FULL = `${BASE}, picking_started_at, refunded_nok, authorized_nok, online_order_items(id, product_id, name, qty, unit_price_nok, line_total_nok, picked_qty, missing_qty, returned_qty, products(barcode, image_url))`;
const COLS_PICK = `${BASE}, picking_started_at, online_order_items(id, product_id, name, qty, unit_price_nok, line_total_nok, picked_qty, missing_qty, products(barcode, image_url))`;
const COLS_BASE = `${BASE}, online_order_items(id, product_id, name, qty, unit_price_nok, line_total_nok)`;

function mapRow(r: Record<string, unknown>): OnlineOrder {
  const { online_order_items, ...rest } = r;
  const items = ((online_order_items as Record<string, unknown>[] | null) ?? []).map((i) => {
    const p = i.products as { barcode: string | null; image_url: string | null } | null;
    return {
      id: String(i.id),
      product_id: (i.product_id as string | null) ?? null,
      name: String(i.name),
      qty: Number(i.qty),
      unit_price_nok: Number(i.unit_price_nok),
      line_total_nok: Number(i.line_total_nok),
      picked_qty: Number(i.picked_qty ?? 0),
      missing_qty: Number(i.missing_qty ?? 0),
      returned_qty: Number(i.returned_qty ?? 0),
      barcode: p?.barcode ?? null,
      image: p?.image_url ?? null,
    } satisfies OnlineOrderItem;
  });
  const o = rest as Record<string, unknown>;
  return {
    ...(rest as Omit<OnlineOrder, "items" | "picking_started_at" | "refunded_nok" | "authorized_nok">),
    picking_started_at: (o.picking_started_at as string | null) ?? null,
    refunded_nok: Number(o.refunded_nok ?? 0),
    authorized_nok: o.authorized_nok == null ? null : Number(o.authorized_nok),
    items,
  };
}

/** Prøv med alle kolonner, fall tilbake når en SQL-fil ikke er kjørt ennå. */
async function selectOrders(build: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  let features: OrderFeatures = { picking: true, returns: true };
  let res = await build(COLS_FULL);
  if (res.error) {
    features = { picking: true, returns: false };
    res = await build(COLS_PICK);
  }
  if (res.error) {
    features = { picking: false, returns: false };
    res = await build(COLS_BASE);
  }
  return { res, features };
}

/** Ekte ordrer (ikke ventende/avbrutte Vipps-betalinger). */
const isReal = (o: OnlineOrder) => !(o.payment_method !== "pay_at_pickup" && (o.payment_status === "pending" || o.payment_status === "failed"));

/**
 * Ordrelisten. Med søk letes det i alle ordrer (ordrenr., navn, e-post,
 * telefon); uten søk vises siste 90 dager.
 */
export async function getOnlineOrders(search = ""): Promise<{
  rows: OnlineOrder[];
  ready: boolean;
  pickingReady: boolean;
  features: OrderFeatures;
}> {
  try {
    const sb = await createClient();
    const q = search.trim().replace(/[%_,()"\\]/g, " ").trim().slice(0, 80);
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    // Søk på varenavn: finn ordrene som inneholder varen.
    let byItem: string[] = [];
    if (q.length >= 3 && !/^#?\d+$/.test(q)) {
      const { data } = await sb.from("online_order_items").select("order_id").ilike("name", `%${q}%`).limit(100);
      byItem = Array.from(new Set(((data ?? []) as { order_id: string }[]).map((r) => r.order_id)));
    }
    const { res, features } = await selectOrders((cols) => {
      let query = sb.from("online_orders").select(cols);
      if (q) {
        const n = q.replace(/^#/, "");
        const ors = [`name.ilike."%${q}%"`, `email.ilike."%${q}%"`, `phone.ilike."%${q.replace(/\s/g, "")}%"`];
        if (/^\d{1,9}$/.test(n)) ors.push(`order_no.eq.${n}`);
        if (byItem.length) ors.push(`id.in.(${byItem.join(",")})`);
        query = query.or(ors.join(","));
      } else {
        query = query.gte("created_at", since);
      }
      return query.order("created_at", { ascending: false }).limit(q ? 100 : 300);
    });
    if (res.error)
      return {
        rows: [],
        ready: !/relation|does not exist|schema/i.test(res.error.message),
        pickingReady: features.picking,
        features,
      };
    const rows = ((res.data ?? []) as Record<string, unknown>[]).map(mapRow).filter(isReal);
    return { rows, ready: true, pickingReady: features.picking, features };
  } catch {
    return { rows: [], ready: false, pickingReady: false, features: { picking: false, returns: false } };
  }
}

/** Én ordre med historikk. */
export async function getOnlineOrder(id: string): Promise<{
  order: OnlineOrder | null;
  events: OrderEvent[];
  features: OrderFeatures;
}> {
  const empty = { order: null, events: [], features: { picking: false, returns: false } };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return empty;
  try {
    const sb = await createClient();
    const { res, features } = await selectOrders((cols) => sb.from("online_orders").select(cols).eq("id", id).limit(1));
    const row = ((res.data ?? []) as Record<string, unknown>[])[0];
    if (res.error || !row) return { ...empty, features };
    let events: OrderEvent[] = [];
    if (features.returns) {
      const { data } = await sb
        .from("online_order_events")
        .select("id, created_at, kind, text, amount_nok, profiles(full_name, email)")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      events = ((data ?? []) as Record<string, unknown>[]).map((e) => {
        const p = e.profiles as { full_name?: string | null; email?: string | null } | null;
        return {
          id: Number(e.id),
          created_at: String(e.created_at),
          kind: String(e.kind),
          text: String(e.text),
          amount_nok: e.amount_nok == null ? null : Number(e.amount_nok),
          by: p?.full_name || p?.email || null,
        };
      });
    }
    return { order: mapRow(row), events, features };
  } catch {
    return empty;
  }
}

/** En kundes nettordrer (kundekortet i admin). Kobles på kunde-id eller e-post. */
export async function getCustomerOnlineOrders(customerId: string, email: string | null): Promise<OnlineOrder[]> {
  try {
    const sb = await createClient();
    const e = (email ?? "").trim().replace(/[%_,()\\]/g, "");
    const { res } = await selectOrders((cols) => {
      const query = sb.from("online_orders").select(cols);
      return (e ? query.or(`customer_id.eq.${customerId},email.ilike.${e}`) : query.eq("customer_id", customerId))
        .order("created_at", { ascending: false })
        .limit(50);
    });
    if (res.error) return [];
    return ((res.data ?? []) as Record<string, unknown>[]).map(mapRow).filter(isReal);
  } catch {
    return [];
  }
}

export type PickableProduct = { id: string; name: string; price_nok: number; stock: number; barcode: string | null };

/** Produkter som kan legges til en ordre / gis i bytte. */
export async function getPickableProducts(): Promise<PickableProduct[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("products")
      .select("id, name, web_name, price_nok, stock, barcode")
      .eq("active", true)
      .eq("is_gift_card", false)
      .order("name")
      .limit(1000);
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: String(p.id),
      name: String((p.web_name as string | null) || p.name),
      price_nok: Number(p.price_nok),
      stock: Number(p.stock ?? 0),
      barcode: (p.barcode as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Antall ordrer som venter på kassa (til banneret). */
export async function countOpenOnlineOrders(): Promise<number> {
  try {
    const sb = await createClient();
    const { count, error } = await sb
      .from("online_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["new", "picking"])
      .or("payment_method.eq.pay_at_pickup,payment_status.eq.authorized");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
