import { CostImport } from "@/components/admin/CostImport";
import { MarginOverview, type MarginRow } from "@/components/admin/MarginOverview";
import { PageHeader } from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/reports/fetch-all";
import { getProductCosts } from "@/app/admin/produkter/costs";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  barcode: string | null;
  price_nok: number | string | null;
  stock: number | string | null;
  active: boolean | null;
  is_gift_card: boolean | null;
};

async function loadProducts(): Promise<Row[]> {
  const sb = await createClient();
  const q = (cols: string) =>
    fetchAll<Row>((from, to) => sb.from("products").select(cols).order("id").range(from, to).returns<Row[]>());
  try {
    return await q("id, name, brand, category, barcode, price_nok, stock, active, is_gift_card");
  } catch {
    // brand/category finnes ikke ennå.
    return await q("id, name, barcode, price_nok, stock, active, is_gift_card");
  }
}

export default async function VaremarginPage() {
  const [products, cost] = await Promise.all([loadProducts(), getProductCosts()]);
  const rows: MarginRow[] = products
    .filter((p) => !p.is_gift_card)
    .map((p) => {
      const c = cost.costs[p.id];
      return {
        id: p.id,
        name: p.name,
        brand: p.brand ?? null,
        category: p.category ?? null,
        barcode: p.barcode,
        priceInkl: Number(p.price_nok) || 0,
        stock: Number(p.stock) || 0,
        active: !!p.active,
        cost: c ? c.cost_nok : null,
        source: c?.source ?? null,
        note: c?.note ?? null,
      };
    });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Varemargin & lagerverdi"
        description="Innkjøp, margin og lagerverdi per vare. Utsalg er inkl. 25 % mva, innkjøp er eks. mva."
      />
      {!cost.ok && (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-danger">
          Kjør KJØR-I-SUPABASE-INNKJOPSPRIS.sql i Supabase for å kunne lagre innkjøpspriser.
        </p>
      )}
      {cost.ok && !cost.hasMeta && (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-muted">
          Kjør KJØR-I-SUPABASE-PRISKALKULATOR.sql for å lagre kilde (import/anslag) og merknad på innkjøpspriser.
        </p>
      )}
      <MarginOverview rows={rows} />
      <CostImport disabled={!cost.ok} />
    </div>
  );
}
