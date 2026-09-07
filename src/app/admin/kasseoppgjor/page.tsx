import { StatTile } from "@/components/ui/StatTile";
import { SettlementManager } from "@/components/admin/SettlementManager";
import { getCashSettlements, getSalesTotalForDate } from "@/lib/ops-queries";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default async function AdminKasseoppgjor() {
  const today = new Date().toISOString().slice(0, 10);
  const [settlements, todaySales] = await Promise.all([
    getCashSettlements(),
    getSalesTotalForDate(today),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="mb-1 font-display text-2xl font-bold">Kasseoppgjør</h1>
        <p className="text-sm text-muted">
          Registrer dagsoppgjør fra kassen. Beløp er inkl. mva.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Registrert salg i dag"
          value={kr(todaySales)}
          sub="fra kassen (sales), inkl. mva"
        />
        <StatTile
          label="Oppgjør registrert"
          value={String(settlements.length)}
          sub="siste 180 dager"
        />
      </div>

      <SettlementManager settlements={settlements} defaultDate={today} />
    </div>
  );
}
