import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ShopSettlementForm } from "@/components/kasse/ShopSettlementForm";
import { dateSettlementInfo } from "@/app/kasse/kasseoppgjor/actions";
import { getSalesTotalForDate } from "@/lib/ops-queries";
import { getMissingSettlementDays } from "@/lib/settlement-status";

export const dynamic = "force-dynamic";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default async function KasseKasseoppgjor() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });

  const [todaySales, initial, missing] = await Promise.all([
    getSalesTotalForDate(today),
    dateSettlementInfo(today),
    getMissingSettlementDays(),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <PageHeader
        title="Kasseoppgjør"
        description="Tell opp kassa ved dagens slutt og lever oppgjøret. Dagens salg kommer automatisk fra kassen. Beløp er inkl. mva."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Registrert salg i dag"
          value={kr(Math.round(todaySales))}
          sub="automatisk fra kassen, inkl. mva"
        />
        <StatTile
          label="Status i dag"
          value={initial.delivered ? "Levert ✓" : "Ikke levert"}
          sub={initial.delivered ? "oppgjøret er bekreftet" : "lever før du går hjem"}
        />
      </div>

      <ShopSettlementForm today={today} initial={initial} missing={missing} />
    </main>
  );
}
