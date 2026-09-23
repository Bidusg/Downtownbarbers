import { PageHeader } from "@/components/ui/PageHeader";
import { PriceMatrix, type MatrixService } from "@/components/admin/PriceMatrix";
import { createClient } from "@/lib/supabase/server";
import { STAFF_LEVELS, asStaffLevel, type StaffLevel } from "@/lib/levels";

export const dynamic = "force-dynamic";

function emptyLevels(): Record<StaffLevel, { price: string; duration: string }> {
  return STAFF_LEVELS.reduce(
    (acc, l) => {
      acc[l] = { price: "", duration: "" };
      return acc;
    },
    {} as Record<StaffLevel, { price: string; duration: string }>,
  );
}

export default async function AdminPriserPage() {
  const sb = await createClient();
  const [{ data: services }, { data: prices }] = await Promise.all([
    sb
      .from("services")
      .select(
        "id, name, price_nok, duration_min, active, sort_order, service_categories(name, sort_order)",
      )
      .eq("active", true),
    sb
      .from("service_level_prices")
      .select("service_id, level, price_nok, duration_min"),
  ]);

  const priceMap = new Map<
    string,
    Record<StaffLevel, { price: string; duration: string }>
  >();
  for (const p of prices ?? []) {
    const sid = p.service_id as string;
    const lvl = asStaffLevel(p.level as string);
    const cur = priceMap.get(sid) ?? emptyLevels();
    cur[lvl] = {
      price: p.price_nok != null ? String(p.price_nok) : "",
      duration: p.duration_min != null ? String(p.duration_min) : "",
    };
    priceMap.set(sid, cur);
  }

  const rows: MatrixService[] = (services ?? [])
    .map((s) => {
      const cat = s.service_categories as
        | { name?: string; sort_order?: number }
        | null;
      return {
        id: s.id as string,
        name: s.name as string,
        category: cat?.name ?? "Annet",
        catSort: cat?.sort_order ?? 0,
        serviceSort: (s.sort_order as number) ?? 0,
        basePrice: Number(s.price_nok) || 0,
        baseDuration: Number(s.duration_min) || 30,
        levels: priceMap.get(s.id as string) ?? emptyLevels(),
      };
    })
    .sort(
      (a, b) =>
        a.catSort - b.catSort ||
        a.category.localeCompare(b.category) ||
        a.serviceSort - b.serviceSort ||
        a.name.localeCompare(b.name),
    );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Priser per nivå"
        description="Sett pris og varighet per nivå (Junior / Barber / Senior / Master) for hver tjeneste. Tomt felt = tjenestens grunnpris/-varighet. Kunden ser prisen for barberen hen velger."
      />
      {rows.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-center text-sm text-muted">
          Ingen aktive tjenester enda. Legg til tjenester under{" "}
          <a href="/admin/tjenester" className="text-accent-soft hover:underline">
            Tjenester
          </a>{" "}
          først.
        </div>
      ) : (
        <PriceMatrix services={rows} />
      )}
    </div>
  );
}
