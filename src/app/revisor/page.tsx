import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { getRevenueSeries, getRevenueSummary } from "@/lib/dashboard-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default async function RevisorHome({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.periode === "months" ? "months" : "days";
  const [series, sum] = await Promise.all([
    getRevenueSeries(period),
    getRevenueSummary(),
  ]);
  const maxBarber = Math.max(1, ...sum.perBarber.map((b) => b.nok));

  const tab = (key: "days" | "months", label: string) => (
    <a
      href={`/revisor?periode=${key}`}
      className={
        "border-b-2 px-3 py-2 text-sm transition-colors " +
        (period === key
          ? "border-accent-soft font-semibold text-fg"
          : "border-transparent text-muted hover:text-fg")
      }
    >
      {label}
    </a>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Regnskapsoversikt</h1>
          <p className="text-sm text-muted">Read-only tilgang for revisor.</p>
        </div>
        <a
          href="/revisor/eksport"
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          Last ned alle salg (CSV)
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Omsetning måned" value={nok(sum.month)} sub="denne måneden" />
        <StatTile label="Omsetning i dag" value={nok(sum.today)} />
        <StatTile label="Antall salg" value={String(sum.saleCount)} sub="denne måneden" />
        <StatTile label="Snitt per salg" value={nok(sum.avgPerSale)} />
      </div>

      <div className="border border-line bg-surface">
        <div className="flex items-center gap-1 border-b border-line px-4">
          {tab("days", "Siste 14 dager")}
          {tab("months", "Siste 12 måneder")}
        </div>
        <div className="p-6">
          <RevenueChart data={series} />
        </div>
      </div>

      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Omsetning per barber</h2>
        {sum.perBarber.length === 0 ? (
          <p className="text-sm text-muted">Ingen salg registrert denne måneden.</p>
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
      </div>

      <p className="text-xs text-muted">
        Full SAF-T-eksport kommer senere. CSV-en over inneholder alle salg med
        dato, barber, beløp og betalingsmåte.
      </p>
    </div>
  );
}
