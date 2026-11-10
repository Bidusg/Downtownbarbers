import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/reports/fetch-all";

export type ProductCost = {
  cost_nok: number;
  supplier: string | null;
  supplier_sku: string | null;
};

/**
 * Innkjøpspriser per produkt-ID. `ok:false` = tabellen product_costs finnes
 * ikke ennå (KJØR-I-SUPABASE-INNKJOPSPRIS.sql er ikke kjørt) – siden fungerer
 * likevel, bare uten innkjøpsfeltene.
 */
export async function getProductCosts(): Promise<{ ok: boolean; costs: Record<string, ProductCost> }> {
  try {
    const sb = await createClient();
    const rows = await fetchAll<{
      product_id: string;
      cost_nok: number | string;
      supplier: string | null;
      supplier_sku: string | null;
    }>((from, to) =>
      sb
        .from("product_costs")
        .select("product_id, cost_nok, supplier, supplier_sku")
        .order("product_id")
        .range(from, to),
    );
    const costs: Record<string, ProductCost> = {};
    for (const r of rows) {
      costs[r.product_id] = {
        cost_nok: Number(r.cost_nok) || 0,
        supplier: r.supplier,
        supplier_sku: r.supplier_sku,
      };
    }
    return { ok: true, costs };
  } catch {
    return { ok: false, costs: {} };
  }
}
