import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import {
  getRevenueSeries,
  getRevenueSummary,
  getSalesForPeriod,
} from "@/lib/dashboard-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default async function RevisorHome({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.periode === "months" ? "months" : "days";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  // Standardperiode for SAF-T: inneværende måned (yyyy-mm-dd).
  const pad = (n: number) => String(n).padStart(2, "0");
  const saftFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const saftLast = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const saftTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(saftLast)}`;
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
            <a href="/revisor/rapport" className="text-accent-soft hover:underline">
              Perioderapport
            </a>{" "}
            for kvartal/halvår/helår.
          </p>
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
          <RevenueChart data={series} drillBase="/revisor/omsetning" period={period} />
          <p className="mt-3 text-xs text-muted">
            Klikk et punkt i grafen for å bore ned i en {period === "months" ? "måned" : "dag"}.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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

        <div className="border border-line bg-surface p-6">
          <h2 className="mb-5 font-display text-lg font-bold">Per betalingsmåte</h2>
          <p className="mb-4 text-xs text-muted">Denne måneden</p>
          {monthDetail.byMethod.length === 0 ? (
            <p className="text-sm text-muted">Ingen salg registrert denne måneden.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {monthDetail.byMethod.map((m) => (
                <li
                  key={m.method}
                  className="flex justify-between border-b border-line pb-2 last:border-0"
                >
                  <span className="text-fg-soft">{m.method}</span>
                  <span className="font-medium">{nok(m.nok)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* SAF-T / regnskapseksport */}
      <div className="border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-bold">SAF-T & regnskapseksport</h2>
        <p className="mt-1 text-sm text-muted">
          SAF-T Financial (Regnskap) v1.30 for valgt periode — standard kontoplan,
          MVA-kode og balanserte dagsbilag fra kassesalg + Zettle.
        </p>
        <form method="get" action="/revisor/eksport/saft" className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Fra
            <input type="date" name="from" defaultValue={saftFrom} className="border border-line bg-canvas px-3 py-2 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Til
            <input type="date" name="to" defaultValue={saftTo} className="border border-line bg-canvas px-3 py-2 text-sm text-fg" />
          </label>
          <button type="submit" className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover">
            Last ned SAF-T (XML)
          </button>
          <a href={`/revisor/eksport/xlsx?from=${saftFrom}&to=${saftTo}`} className="border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft">
            Salg denne måned (Excel)
          </a>
          <a href="/revisor/eksport" className="border border-line-2 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg">
            Alle salg (CSV)
          </a>
        </form>
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Merk: eksporten dekker inntektssiden (salg + utgående mva). Fullt lovpålagt
          SAF-T med kjøp/kostnader og balanse kommer fra det komplette regnskapet.
          Kjør filen gjennom Skatteetatens SAF-T-validator før offisiell innsending.
          Firmafelt (org.nr, adresse) settes via settings-nøkkelen{" "}
          <code className="text-fg">saft_company</code>.
        </p>
      </div>
    </div>
  );
}
