import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { adminKpis, revenue7d, barberGoals, todayShop } from "@/lib/data/mock";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default function AdminDashboard() {
  const shopPct = Math.round(
    (todayShop.customersServed / todayShop.customersTarget) * 100,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* KPI-er (admin ser kroner) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Omsetning i dag" value={nok(adminKpis.revenueToday)} sub="14 salg" />
        <StatTile label="Bookinger i dag" value={String(adminKpis.bookingsToday)} sub="3 gjenstår" />
        <StatTile
          label="Fullføringsgrad"
          value={Math.round(adminKpis.completionRate * 100) + " %"}
          sub="siste 30 dager"
        />
        <StatTile label="Snittrating" value={adminKpis.avgRating.toFixed(1).replace(".", ",")} sub="alle barbere" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Omsetningsgraf */}
        <div className="border border-line bg-surface p-6 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Omsetning siste 7 dager</h2>
            <span className="text-xs text-muted">NOK</span>
          </div>
          <RevenueChart data={revenue7d} />
        </div>

        {/* Shop-dagsmål */}
        <div className="border border-line bg-surface p-6">
          <h2 className="mb-1 font-display text-lg font-bold">Shop – dagsmål</h2>
          <p className="mb-5 text-xs text-muted">Kunder gjennom dagen</p>
          <div className="mb-2 flex items-end justify-between">
            <span className="font-display text-4xl font-bold text-fg">{shopPct} %</span>
            <span className="text-sm text-muted">
              {todayShop.customersServed} / {todayShop.customersTarget}
            </span>
          </div>
          <ProgressBar value={shopPct} />
          <p className="mt-4 text-xs text-muted">
            Fase 1: basert på kundeantall. Byttes til fast kronemål senere.
          </p>
        </div>
      </div>

      {/* Månedsmål per barber (admin ser kr + %) */}
      <div className="border border-line bg-surface p-6">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Månedsmål per barber</h2>
          <span className="text-xs text-muted">Oktober</span>
        </div>
        <div className="space-y-5">
          {barberGoals.map((b) => {
            const pct = Math.round((b.achieved / b.target) * 100);
            return (
              <div key={b.name}>
                <ProgressBar
                  value={pct}
                  label={`${b.name} · ${b.title}`}
                  caption={`${nok(b.achieved)} / ${nok(b.target)} · ${pct} %`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
