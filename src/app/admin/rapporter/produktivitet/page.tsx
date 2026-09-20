import Link from "next/link";
import { StatTile } from "@/components/ui/StatTile";
import { resolveRange } from "@/lib/report-queries";
import {
  getBarberScores,
  getNoShowOverview,
} from "@/lib/productivity-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

/* Hurtigvalg for periode (Oslo-datoer) – samme som hovedrapporten. */
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

function utilTone(pct: number): string {
  if (pct >= 75) return "text-accent-soft";
  if (pct >= 45) return "text-fg";
  return "text-muted";
}

export default async function AdminProduktivitet({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const r = resolveRange(sp.from, sp.to);

  const [scores, noShow] = await Promise.all([
    getBarberScores(r),
    getNoShowOverview(r),
  ]);

  const eksport = `/admin/rapporter/eksport?type=produktivitet&from=${r.from}&to=${r.to}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Produktivitet per barber</h1>
          <p className="mt-1 text-sm text-muted">
            Periode: <span className="text-fg">{r.label}</span>
          </p>
        </div>
        <Link
          href={`/admin/rapporter?from=${r.from}&to=${r.to}`}
          className="border border-line-2 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
        >
          ← Rapporter
        </Link>
      </div>

      {/* Periodevelger */}
      <div className="border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {presets().map((p) => {
            const active = p.from === r.from && p.to === r.to;
            return (
              <a
                key={p.label}
                href={`/admin/rapporter/produktivitet?from=${p.from}&to=${p.to}`}
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

      {/* Salong-sammendrag */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Timeutnyttelse" value={`${scores.salon.utilizationPct} %`} sub={`${scores.salon.bookedHours} av ${scores.salon.capacityHours} t (turnus)`} />
        <StatTile label="Omsetning" value={nok(scores.salon.revenue)} sub="inkl. mva" />
        <StatTile label="Fullførte timer" value={String(scores.salon.completed)} sub="i perioden" />
        <StatTile label="Ikke møtt" value={`${scores.salon.noShowPct} %`} sub={`${scores.salon.noShow} av ${scores.salon.completed + scores.salon.noShow}`} />
      </div>

      {/* Per barber scorecard */}
      <div className="border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">Scorecard per barber</h2>
            <p className="mt-1 text-xs text-muted">
              Timeutnyttelse er booket tid mot faktisk turnus (uke A/B, fravær trukket fra); barbere uten turnus regnes mot åpningstiden. Samme definisjon som Nøkkeltall.
            </p>
          </div>
          <a
            href={eksport}
            className="inline-flex items-center gap-1.5 border border-line-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            CSV
          </a>
        </div>
        {scores.rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen aktive barberere / data i perioden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Barber</th>
                  <th className="px-4 py-3 text-right font-medium">Omsetning</th>
                  <th className="px-4 py-3 text-right font-medium">Salg</th>
                  <th className="px-4 py-3 text-right font-medium">Snitt</th>
                  <th className="px-4 py-3 text-right font-medium">Fullført</th>
                  <th className="px-4 py-3 text-right font-medium">Rebooking</th>
                  <th className="px-4 py-3 text-right font-medium">Ikke møtt</th>
                  <th className="px-6 py-3 text-right font-medium">Utnyttelse</th>
                </tr>
              </thead>
              <tbody>
                {scores.rows.map((b) => (
                  <tr key={b.staffId} className="border-b border-line last:border-0">
                    <td className="px-6 py-3">
                      <span className="font-medium text-fg">{b.name}</span>
                      {b.title && <span className="block text-xs text-muted">{b.title}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{nok(b.revenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{b.saleCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{nok(b.avgSale)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{b.completed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{b.rebookedPct} %</td>
                    <td className={"px-4 py-3 text-right tabular-nums " + (b.noShow > 0 ? "text-danger" : "text-muted")}>
                      {b.noShow} ({b.noShowPct} %)
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={"font-display font-bold tabular-nums " + utilTone(b.utilizationPct)}>
                        {b.utilizationPct} %
                      </span>
                      <span className="block text-xs text-muted tabular-nums">
                        {b.bookedHours} / {b.capacityHours} t
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* No-show-oversikt */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="border border-line bg-surface">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Ikke møtt per barber</h2>
          </div>
          {noShow.perBarber.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted">Ingen fullførte/ikke-møtt-timer i perioden.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {noShow.perBarber.map((b) => (
                  <tr key={b.name} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 text-fg">{b.name}</td>
                    <td className={"px-6 py-3 text-right tabular-nums " + (b.count > 0 ? "text-danger" : "text-muted")}>
                      {b.count} <span className="text-xs text-muted">({b.pct} %)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-line bg-surface">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Gjengangere (≥ 2 ikke møtt)</h2>
          </div>
          {noShow.repeatCustomers.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted">Ingen kunder med gjentatte no-show i perioden.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {noShow.repeatCustomers.map((c) => (
                  <tr key={c.name} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 text-fg">{c.name}</td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums text-danger">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
