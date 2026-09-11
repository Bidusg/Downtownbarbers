import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * LAGER – query-lag
 *   Beholdning per produkt (med lav-lager-flagg) + bevegelseslogg.
 *   Defensivt: tomt resultat ved feil.
 * ===================================================================== */

export type InventoryItem = {
  id: string;
  name: string;
  stock: number;
  threshold: number;
  price: number;
  active: boolean;
  isGiftCard: boolean;
  lowStock: boolean;
  value: number; // stock * price
};

export async function getInventory(): Promise<InventoryItem[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("products")
      .select("id, name, stock, low_stock_threshold, price_nok, active, is_gift_card")
      .eq("is_gift_card", false)
      .order("name");
    return (data ?? []).map((p) => {
      const stock = Number(p.stock) || 0;
      const threshold = Number(p.low_stock_threshold ?? 5);
      const price = Number(p.price_nok) || 0;
      const active = Boolean(p.active);
      return {
        id: p.id as string,
        name: p.name as string,
        stock,
        threshold,
        price,
        active,
        isGiftCard: Boolean(p.is_gift_card),
        lowStock: active && stock <= threshold,
        value: Math.round(stock * price),
      };
    });
  } catch {
    return [];
  }
}

export type StockMovement = {
  id: string;
  productName: string;
  delta: number;
  reason: string;
  note: string | null;
  newStock: number | null;
  at: string;
};

export async function getStockMovements(limit = 40): Promise<StockMovement[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("stock_movements")
      .select("id, delta, reason, note, new_stock, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((m) => ({
      id: m.id as string,
      productName: (m.products as { name?: string } | null)?.name ?? "—",
      delta: Number(m.delta) || 0,
      reason: (m.reason as string) ?? "justering",
      note: (m.note as string) ?? null,
      newStock: m.new_stock === null ? null : Number(m.new_stock),
      at: m.created_at as string,
    }));
  } catch {
    return [];
  }
}
