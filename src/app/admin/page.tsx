import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RevenueChart } from "@/components/admin/RevenueChart";
import {
  getRevenueSeries,
  getRevenueSummary,
  getShopToday,
} from "@/lib/dashboard-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default async function AdminDashboard() {
  const [sum, series, shop] = await Promise.all([
    getRevenueSummary(),
    getRevenueSeries("days"),
    getShopToday(),
  ]);
  const shopPct = shop.customersTarget
    ? Math.round((shop.customersServed / shop.customersTarget) * 100)
    : 0;
  const maxBarber = Math.max(1, ...sum.perBarber.map((b) => b.nok));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Dashboard"
        description="Omsetning, mål og dagens drift på ett sted."
      />

      {!sum.hasData && (
        <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
          <span className="mt-0.5 text-accent-soft">●</span>
          <p className="text-muted">
            <strong className="text-fg">Venter på salg.</strong> Omsetningstallene
            fylles automatisk når timer fullføres og betales i kassen.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Omsetning i dag" value={nok(sum.today)} />
        <StatTile label="Omsetning måned" value={nok(sum.month)} sub="denne måneden" />
        <StatTile label="Antall salg" value={String(sum.saleCount)} sub="denne måneden" />
        <StatTile label="Snitt per salg" value={nok(sum.avgPerSale)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Omsetning siste 14 dager</h2>
            <Button
              href="/admin/regnskap"
              variant="link"
              className="text-xs font-semibold"
            >
              Se regnskap →
            </Button>
          </div>
          <RevenueChart data={series} drillBase="/admin/omsetning" period="days" />
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-lg font-bold">Shop – dagsmål</h2>
          <p className="mb-5 text-xs text-muted">Kunder gjennom dagen</p>
          <div className="mb-2 flex items-end justify-between">
            <span className="font-display text-4xl font-bold text-fg">{shopPct} %</span>
            <span className="text-sm text-muted">
              {shop.customersServed} / {shop.customersTarget}
            </span>
          </div>
          <ProgressBar value={shopPct} />
          {!shop.live && (
            <p className="mt-4 text-xs text-muted">
              Testtall til ekte bookinger registreres.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Omsetning per barber</h2>
          <span className="text-xs text-muted">denne måneden</span>
        </div>
        {sum.perBarber.length === 0 ? (
          <p className="text-sm text-muted">Ingen salg registrert enda.</p>
        ) : (
          <div className="space-y-5">
            {sum.perBarber.map((b) => (
              <ProgressBar
                key={b.name}
                value={Math.round((b.nok / maxBarber) * 100)}
                label={b.name}
                caption={nok(b.nok)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
