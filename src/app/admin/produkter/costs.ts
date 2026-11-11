import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/reports/fetch-all";

export type CostSource = "manuell" | "import" | "anslag";

export type ProductCost = {
  cost_nok: number;
  supplier: string | null;
  supplier_sku: string | null;
  source: CostSource | null;
  note: string | null;
};

type CostRow = {
  product_id: string;
  cost_nok: number | string;
  supplier: string | null;
  supplier_sku: string | null;
  cost_source?: string | null;
  note?: string | null;
};

function toSource(v: string | null | undefined): CostSource | null {
  return v === "manuell" || v === "import" || v === "anslag" ? v : null;
}

/**
 * Innkjøpspriser per produkt-ID.
 *  - `ok:false` = tabellen product_costs finnes ikke ennå
 *    (KJØR-I-SUPABASE-INNKJOPSPRIS.sql er ikke kjørt).
 *  - `hasMeta:false` = kolonnene cost_source/note finnes ikke ennå
 *    (KJØR-I-SUPABASE-PRISKALKULATOR.sql er ikke kjørt); source/note er da null.
 * Siden fungerer likevel i begge tilfeller.
 */
export async function getProductCosts(): Promise<{
  ok: boolean;
  hasMeta: boolean;
  costs: Record<string, ProductCost>;
}> {
  let sb: Awaited<ReturnType<typeof createClient>>;
  try {
    sb = await createClient();
  } catch {
    return { ok: false, hasMeta: false, costs: {} };
  }

  let rows: CostRow[];
  let hasMeta = true;
  try {
    rows = await fetchAll<CostRow>((from, to) =>
      sb
        .from("product_costs")
        .select("product_id, cost_nok, supplier, supplier_sku, cost_source, note")
        .order("product_id")
        .range(from, to),
    );
  } catch {
    // Kolonnene mangler (eller tabellen) – prøv eldre select.
    hasMeta = false;
    try {
      rows = await fetchAll<CostRow>((from, to) =>
        sb
          .from("product_costs")
          .select("product_id, cost_nok, supplier, supplier_sku")
          .order("product_id")
          .range(from, to),
      );
    } catch {
      return { ok: false, hasMeta: false, costs: {} };
    }
  }

  const costs: Record<string, ProductCost> = {};
  for (const r of rows) {
    costs[r.product_id] = {
      cost_nok: Number(r.cost_nok) || 0,
      supplier: r.supplier,
      supplier_sku: r.supplier_sku,
      source: hasMeta ? toSource(r.cost_source) : null,
      note: hasMeta ? (r.note ?? null) : null,
    };
  }
  return { ok: true, hasMeta, costs };
}
