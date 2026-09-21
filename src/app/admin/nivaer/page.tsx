import { requireRole } from "@/lib/auth";
import {
  getLevels,
  getServicesForPricing,
  getServiceLevelPrices,
} from "@/lib/levels-queries";
import { LevelPricingMatrix } from "@/components/admin/LevelPricingMatrix";

export const dynamic = "force-dynamic";

export default async function AdminNivaer() {
  await requireRole(["admin"]);
  const [levels, services, prices] = await Promise.all([
    getLevels(),
    getServicesForPricing(),
    getServiceLevelPrices(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Nivåer &amp; prising</h1>
        <p className="mt-1 text-sm text-muted">
          Sett fast pris per nivå × tjeneste. Når en ansatt får et nivå (under{" "}
          <span className="text-fg">Ansatte → Rediger</span>), vises riktig pris
          automatisk på kundens booking. Står en celle tom, brukes basisprisen.
        </p>
      </div>

      {levels.length === 0 ? (
        <div className="border border-line bg-surface p-6 text-sm text-muted">
          Ingen nivåer funnet. Kjør migrasjon 0052 i Supabase først.
        </div>
      ) : (
        <LevelPricingMatrix
          levels={levels}
          services={services}
          prices={prices}
        />
      )}
    </div>
  );
}
