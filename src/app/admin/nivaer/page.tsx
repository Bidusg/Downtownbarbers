import { requireRole } from "@/lib/auth";
import {
  getLevels,
  getServicesForPricing,
  getServiceLevelPrices,
} from "@/lib/levels-queries";
import { LevelPricingMatrix } from "@/components/admin/LevelPricingMatrix";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

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
      <PageHeader
        title="Nivåer & prising"
        description="Sett fast pris per nivå × tjeneste. Når en ansatt får et nivå (under Ansatte → Rediger), vises riktig pris automatisk på kundens booking. Står en celle tom, brukes basisprisen."
      />

      {levels.length === 0 ? (
        <Card className="text-sm text-muted">
          Ingen nivåer funnet. Kjør migrasjon 0052 i Supabase først.
        </Card>
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
