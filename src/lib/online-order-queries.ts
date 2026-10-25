import { createClient } from "@/lib/supabase/server";

/* Nettordrer for kassa (RLS: bare kasse/admin ser dem). */

export type OnlineOrder = {
  id: string;
  order_no: number;
  created_at: string;
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
  items: OnlineOrderItem[];
};

export type OnlineOrderItem = {
  id: string;
  name: string;
  qty: number;
  unit_price_nok: number;
  line_total_nok: number;
  picked_qty: number;
  missing_qty: number;
  barcode: string | null;
  image: string | null;
};

const BASE =
  "id, order_no, created_at, name, email, phone, delivery, address, postal_code, city, subtotal_nok, discount_nok, shipping_nok, total_nok, member_tier, payment_method, payment_status, status, tracking_no, note, ready_at, completed_at";

/**
 * pickingReady = false betyr at KJØR-I-SUPABASE-NETTORDRE-PLUKK.sql ikke er
 * kjørt ennå – da vises ordrene som før, uten plukking.
 */
export async function getOnlineOrders(): Promise<{ rows: OnlineOrder[]; ready: boolean; pickingReady: boolean }> {
  try {
    const sb = await createClient();
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const query = (cols: string) =>
      sb.from("online_orders").select(cols).gte("created_at", since).order("created_at", { ascending: false }).limit(300);

    let pickingReady = true;
    let res = await query(
      `${BASE}, picking_started_at, online_order_items(id, name, qty, unit_price_nok, line_total_nok, picked_qty, missing_qty, products(barcode, image_url))`,
    );
    if (res.error) {
      pickingReady = false;
      res = await query(`${BASE}, online_order_items(id, name, qty, unit_price_nok, line_total_nok)`);
    }
    if (res.error) return { rows: [], ready: !/relation|does not exist|schema/i.test(res.error.message), pickingReady };

    const rows = ((res.data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const { online_order_items, ...rest } = r;
      const items = ((online_order_items as Record<string, unknown>[] | null) ?? []).map((i) => {
        const p = i.products as { barcode: string | null; image_url: string | null } | null;
        return {
          id: String(i.id),
          name: String(i.name),
          qty: Number(i.qty),
          unit_price_nok: Number(i.unit_price_nok),
          line_total_nok: Number(i.line_total_nok),
          picked_qty: Number(i.picked_qty ?? 0),
          missing_qty: Number(i.missing_qty ?? 0),
          barcode: p?.barcode ?? null,
          image: p?.image_url ?? null,
        } satisfies OnlineOrderItem;
      });
      return {
        picking_started_at: null,
        ...(rest as Omit<OnlineOrder, "items" | "picking_started_at">),
        items,
      } as OnlineOrder;
    });
    // Ventende Vipps-betalinger som ikke er godkjent er ikke ekte ordrer ennå.
    return {
      rows: rows.filter((o) => !(o.payment_status === "pending" && o.payment_method !== "pay_at_pickup")),
      ready: true,
      pickingReady,
    };
  } catch {
    return { rows: [], ready: false, pickingReady: false };
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
