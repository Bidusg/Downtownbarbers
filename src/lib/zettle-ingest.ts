import { createServiceClient } from "@/lib/supabase/service";
import type { MappedSale } from "@/lib/zettle";

/** Upsert Zettle-salg inn i external_sales (idempotent på source+external_id). */
export async function ingestSales(
  sales: MappedSale[],
): Promise<{ upserted: number }> {
  if (sales.length === 0) return { upserted: 0 };
  const sb = createServiceClient();
  const rows = sales.map((s) => ({
    source: "zettle",
    external_id: s.external_id,
    sold_at: s.sold_at,
    amount_nok: s.amount_nok,
    payment_type: s.payment_type,
    products: s.products,
    raw: s.raw,
  }));
  const { error, count } = await sb
    .from("external_sales")
    .upsert(rows, { onConflict: "source,external_id", count: "exact" });
  if (error) throw new Error(error.message);
  return { upserted: count ?? rows.length };
}
