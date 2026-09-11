import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { resolveRange } from "@/lib/report-queries";
import { getKpiOverview } from "@/lib/kpi-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = Number(now.toLocaleString("en-US", { timeZone: "Europe/Oslo", year: "numeric" }));
  const m = Number(now.toLocaleString("en-US", { timeZone: "Europe/Oslo", month: "numeric" }));
  const d = Number(now.toLocaleString("en-US", { timeZone: "Europe/Oslo", day: "numeric" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const pm = m === 1 ? 12 : m - 1;
  const pmY = m === 1 ? y - 1 : y;
  const from30 = new Date(Date.UTC(y, m - 1, d));
  from30.setUTCDate(from30.getUTCDate() - 29);
  return [
    { label: "Denne måneden", from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` },
    { label: "Forrige måned", from: `${pmY}-${pad(pm)}-01`, to: `${pmY}-${pad(pm)}-${pad(lastDay(pmY, pm))}` },
    { label: "Siste 30 dager", from: from30.toISOString().slice(0, 10), to: `${y}-${pad(m)}-${pad(d)}` },
    { label: "Hittil i år", from: `${y}-01-01`, to: `${y}-${pad(m)}-${pad(d)}` },
  ];
}

export default async function AdminNokkeltall({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const r = resolveRange(sp.from, sp.to);
  const k = await getKpiOverview(r);
  const maxBarber = Math.max(1, ...k.utilization.perBarber.map((b) => b.pct));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Nøkkeltall</h1>
        <p className="mt-1 text-sm text-muted">
          Periode: <span className="text-fg">{r.label}</span>
        </p>
      </div>

      {/* Periodevelger */}
      <div className="border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {presets().map((p) => {
            const active = p.from === r.from && p.to === r.to;
            return (
              <a
                key={p.label}
                href={`/admin/nokkeltall?from=${p.from}&to=${p.to}`}
                className={
                  "border px-3 py-1.5 text-xs font-semibold transition-colors " +
                  (active
                    ? "border-accent-soft bg-accent-soft/10 text-fg"
                    : "border-line-2 text-muted hover:bg-surface-2 hover:text-fg")
                }
              >
                {p.label}
              </a>
            );
          })}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Fra
            <input type="date" name="from" defaultValue={r.from} className="border border-line bg-canvas px-3 py-2 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Til
            <input type="date" name="to" defaultValue={r.to} className="border border-line bg-canvas px-3 py-2 text-sm text-fg" />
          </label>
          <button type="submit" className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90">
            Oppdater
          </button>
        </form>
      </div>

      {/* Nøkkeltall-fliser */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Omsetning" value={nok(k.revenue)} sub="inkl. Zettle" />
        <StatTile label="Snitt per salg" value={nok(k.avgSale)} />
        <StatTile label="Rebooking" value={`${k.rebooking.pct} %`} sub="kom tilbake" />
        <StatTile
          label="Anbefaling"
          value={k.referral.withSource > 0 ? `${k.referral.pct} %` : "—"}
          sub="munn-til-munn"
        />
        <StatTile label="Timeutnyttelse" value={`${k.utilization.salonPct} %`} sub="mot åpningstid" />
      </div>

      {/* Timeutnyttelse */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Timeutnyttelse</h2>
          <p className="mt-1 text-xs text-muted">
            Booket {k.utilization.bookedHours} t av {k.utilization.capacityHours} t kapasitet ·{" "}
            {k.utilization.businessDays} åpningsdager × {k.utilization.activeBarbers} barberer (09–21, man–lør)
          </p>
        </div>
        <div className="p-6">
          {k.utilization.perBarber.length === 0 ? (
            <p className="text-sm text-muted">Ingen aktive barberer.</p>
          ) : (
            <div className="space-y-5">
              {k.utilization.perBarber.map((b) => (
                <ProgressBar
                  key={b.name}
                  value={Math.min(100, b.pct)}
                  label={b.name}
                  caption={`${b.pct} % · ${b.hours} t`}
                />
              ))}
            </div>
          )}
          <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
            v1: mot åpningstid. Turnus-presis utnyttelse (uke A/B per barber) aktiveres når A/B-anker er satt.
          </p>
        </div>
      </div>

      {/* Rebooking */}
      <div className="border border-line bg-surface p-6">
        <h2 className="mb-2 font-display text-lg font-bold">Rebooking</h2>
        <div className="mb-3 flex items-end justify-between">
          <span className="font-display text-3xl font-bold text-fg">{k.rebooking.pct} %</span>
          <span className="text-sm text-muted">
            {k.rebooking.rebooked} av {k.rebooking.visitCustomers} kunder
          </span>
        </div>
        <ProgressBar value={k.rebooking.pct} />
        <p className="mt-4 text-xs text-muted">
          Andel kunder med fullført time i perioden som booket en ny time etterpå.
        </p>
      </div>

      {/* Anbefaling / kundekilde */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Anbefaling &amp; kundekilde</h2>
          <p className="mt-1 text-xs text-muted">
            Nye kunder i perioden: {k.referral.newCustomers} · oppga kilde: {k.referral.withSource}
          </p>
        </div>
        <div className="p-6">
          {k.referral.withSource === 0 ? (
            <div className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 text-accent-soft">●</span>
              <p className="text-muted">
                <strong className="text-fg">Fylles framover.</strong> Kilde samles inn fra
                «Hvordan hørte du om oss?» i booking. Tallet blir meningsfullt når nye kunder
                har svart.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-end justify-between">
                <span className="font-display text-3xl font-bold text-fg">{k.referral.pct} %</span>
                <span className="text-sm text-muted">munn-til-munn ({k.referral.wom} av {k.referral.withSource})</span>
              </div>
              <div className="space-y-3">
                {k.referral.breakdown.map((s) => (
                  <div key={s.label} className="flex items-center gap-4">
                    <span className="w-48 shrink-0 text-sm text-fg-soft">{s.label}</span>
                    <span className="h-2.5 flex-1 overflow-hidden bg-surface-2">
                      <span
                        className="block h-full bg-accent-soft"
                        style={{ width: `${Math.round((s.count / k.referral.withSource) * 100)}%` }}
                      />
                    </span>
                    <span className="w-10 text-right text-sm font-medium tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
