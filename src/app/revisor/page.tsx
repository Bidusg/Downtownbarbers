import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import {
  getRevenueSeries,
  getRevenueSummary,
  getSalesForPeriod,
} from "@/lib/dashboard-queries";
import { osloMonthRange } from "@/lib/period";
import { formatKr as nok, methodLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RevisorHome({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.periode === "months" ? "months" : "days";
  // Inneværende måned avgrenset på Oslo-midnatt (serveren kjører i UTC).
  const month = osloMonthRange();
  const monthStart = month.fromIso;
  const monthEnd = month.toIso;
  // Standardperiode for regnskapseksport: inneværende måned (yyyy-mm-dd).
  const [ey, em] = month.key.split("-").map(Number);
  const exportFrom = `${month.key}-01`;
  const exportLast = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  const exportTo = `${month.key}-${String(exportLast).padStart(2, "0")}`;
  const [series, sum, monthDetail] = await Promise.all([
    getRevenueSeries(period),
    getRevenueSummary(),
    getSalesForPeriod(monthStart, monthEnd),
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
          <p className="text-sm text-muted">
            Regnskaps- og lønnstilgang. Se{" "}
            <a href="/revisor/rapport" className="font-medium text-accent-soft underline underline-offset-2 hover:text-fg">
              Perioderapport
            </a>{" "}
            for kvartal/halvår/helår.
          </p>
        </div>
        <a href="/revisor/eksport" className="act act-accent">
          Last ned alle salg (CSV)
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile
          label="Omsetning måned"
          value={nok(sum.month)}
          sub={sum.fixitInMonth > 0 ? `${month.label} · inkl. Fixit-historikk` : month.label}
        />
        <StatTile label="Omsetning i dag" value={nok(sum.today)} />
        <StatTile label="Antall salg" value={sum.saleCount.toLocaleString("nb-NO")} sub={month.label} />
        <StatTile label="Snitt per salg" value={nok(sum.avgPerSale)} sub={month.label} />
      </div>

      <Card padded={false}>
        <div className="flex items-center gap-1 border-b border-line px-4">
          {tab("days", "Siste 14 dager")}
          {tab("months", "Siste 12 måneder")}
        </div>
        <div className="p-6">
          <RevenueChart data={series} drillBase="/revisor/omsetning" period={period} />
          <p className="mt-3 text-xs text-muted">
            Klikk et punkt i grafen for å bore ned i en {period === "months" ? "måned" : "dag"}.
          </p>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-bold">Omsetning per barber</h2>
          <p className="mb-4 text-xs text-muted">{month.label}</p>
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
        </Card>

        <Card>
          <h2 className="mb-5 font-display text-lg font-bold">Per betalingsmåte</h2>
          <p className="mb-4 text-xs text-muted">{month.label}</p>
          {monthDetail.byMethod.length === 0 ? (
            <p className="text-sm text-muted">Ingen salg registrert denne måneden.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {monthDetail.byMethod.map((m) => (
                <li
                  key={m.method}
                  className="flex justify-between border-b border-line pb-2 last:border-0"
                >
                  <span className="text-fg-soft">{methodLabel(m.method)}</span>
                  <span className="font-medium tabular-nums">{nok(m.nok)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Regnskapseksport */}
      <Card>
        <h2 className="font-display text-lg font-bold">Regnskapseksport</h2>
        <p className="mt-1 text-sm text-muted">
          Last ned salgsdata for regnskapsføring. Tripletex er regnskapssystemet
          (master); eksporten dekker inntektssiden (salg + utgående mva).
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <a href={`/revisor/eksport/xlsx?from=${exportFrom}&to=${exportTo}`} className="act act-accent">
            Salg {month.label.toLowerCase()} (Excel)
          </a>
          <a href="/revisor/eksport" className="act">
            Alle salg (CSV)
          </a>
        </div>
      </Card>
    </div>
  );
}
