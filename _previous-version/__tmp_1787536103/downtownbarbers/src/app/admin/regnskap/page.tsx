import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { revenue7d, barberGoals } from "@/lib/data/mock";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default function AdminRegnskap() {
  const monthTotal = barberGoals.reduce((a, b) => a + b.achieved, 0);
  const monthTarget = barberGoals.reduce((a, b) => a + b.target, 0);
  const pct = Math.round((monthTotal / monthTarget) * 100);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <h1 className="font-display text-2xl font-bold">Regnskap & rapporter</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Omsetning måned" value={nok(monthTotal)} sub={`Mål ${nok(monthTarget)}`} />
        <StatTile label="Måloppnåelse" value={pct + " %"} sub="hele salongen" />
        <StatTile label="Snitt per booking" value={nok(485)} sub="oktober" />
      </div>

      <div className="border border-line bg-surface p-6">
        <h2 className="mb-4 font-display text-lg font-bold">Omsetning siste 7 dager</h2>
        <RevenueChart data={revenue7d} />
      </div>

      <div className="border border-line bg-surface p-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Månedsmål – hele salongen</h2>
          <span className="text-sm text-muted">{pct} %</span>
        </div>
        <ProgressBar value={pct} caption={`${nok(monthTotal)} / ${nok(monthTarget)}`} />
      </div>

      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Omsetning per barber</h2>
        <div className="space-y-5">
          {barberGoals.map((b) => {
            const p = Math.round((b.achieved / b.target) * 100);
            return (
              <ProgressBar
                key={b.name}
                value={p}
                label={`${b.name} · ${b.title}`}
                caption={`${nok(b.achieved)} · ${p} %`}
              />
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted">
        Tallene bruker testdata til ekte salg registreres via kassen. Da byttes de automatisk til live-data.
      </p>
    </div>
  );
}
