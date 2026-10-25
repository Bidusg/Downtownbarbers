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
  status: "new" | "ready" | "picked_up" | "shipped" | "cancelled";
  tracking_no: string | null;
  note: string | null;
  ready_at: string | null;
  completed_at: string | null;
  items: { name: string; qty: number; line_total_nok: number }[];
};

export async function getOnlineOrders(): Promise<{ rows: OnlineOrder[]; ready: boolean }> {
  try {
    const sb = await createClient();
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await sb
      .from("online_orders")
      .select(
        "id, order_no, created_at, name, email, phone, delivery, address, postal_code, city, subtotal_nok, discount_nok, shipping_nok, total_nok, member_tier, payment_method, payment_status, status, tracking_no, note, ready_at, completed_at, online_order_items(name, qty, line_total_nok)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return { rows: [], ready: !/relation|does not exist|schema/i.test(error.message) };
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const { online_order_items, ...rest } = r;
      return { ...(rest as Omit<OnlineOrder, "items">), items: (online_order_items as OnlineOrder["items"]) ?? [] };
    });
    // Ventende Vipps-betalinger som ikke er godkjent er ikke ekte ordrer ennå.
    return { rows: rows.filter((o) => !(o.payment_status === "pending" && o.payment_method !== "pay_at_pickup")), ready: true };
  } catch {
    return { rows: [], ready: false };
  }
}

/** Antall ordrer som venter på kassa (til banneret). */
export async function countOpenOnlineOrders(): Promise<number> {
  try {
    const sb = await createClient();
    const { count, error } = await sb
      .from("online_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .or("payment_method.eq.pay_at_pickup,payment_status.eq.authorized");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
