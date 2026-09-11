import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { getGoalProgress } from "@/lib/analytics-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";
const MND = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

function pctTone(pct: number): string {
  if (pct >= 100) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 75) return "text-fg";
  return "text-accent-soft";
}

export default async function AdminMaloppnaelse({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const now = new Date();
  const sp = await searchParams;
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;

  const g = await getGoalProgress(year, month);
  const maxVal = Math.max(1, ...g.rows.map((r) => Math.max(r.actual, r.target)));

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const custPct = g.customerTarget > 0 ? Math.round((g.customerActual / g.customerTarget) * 100) : 0;
  const hasTargets = g.salonTarget > 0 || g.rows.some((r) => r.target > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Måloppnåelse</h1>
          <p className="mt-1 text-sm text-muted">Resultat mot budsjett, {MND[month - 1]} {year}.</p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/admin/maloppnaelse?year=${prev.y}&month=${prev.m}`}
            className="border border-line-2 px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            ← {MND[prev.m - 1].slice(0, 3)}
          </a>
          <a
            href={`/admin/maloppnaelse?year=${next.y}&month=${next.m}`}
            className="border border-line-2 px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            {MND[next.m - 1].slice(0, 3)} →
          </a>
        </div>
      </div>

      {!hasTargets && (
        <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
          <span className="mt-0.5 text-accent-soft">●</span>
          <p className="text-muted">
            <strong className="text-fg">Ingen budsjett satt for denne måneden.</strong>{" "}
            Sett omsetningsmål per barber under{" "}
            <a href={`/admin/budsjett?year=${year}&month=${month}`} className="text-accent-soft hover:underline">
              Budsjett
            </a>
            , så vises måloppnåelsen her.
          </p>
        </div>
      )}

      {/* Salong-nivå */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Omsetning" value={nok(g.salonActual)} sub="inkl. mva, denne måneden" />
        <StatTile label="Mål" value={nok(g.salonTarget)} />
        <StatTile label="Måloppnåelse" value={`${g.salonPct} %`} />
      </div>

      <div className="border border-line bg-surface p-6">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="font-display text-lg font-bold">Salong totalt</h2>
          <span className={"font-display text-2xl font-bold " + pctTone(g.salonPct)}>{g.salonPct} %</span>
        </div>
        <ProgressBar value={g.salonPct} caption={`${nok(g.salonActual)} / ${nok(g.salonTarget)}`} />
      </div>

      {/* Per barber */}
      <div className="border border-line bg-surface p-6">
        <h2 className="mb-5 font-display text-lg font-bold">Per barber</h2>
        {g.rows.length === 0 ? (
          <p className="text-sm text-muted">Ingen aktive barberer.</p>
        ) : (
          <div className="space-y-6">
            {g.rows.map((r) => (
              <div key={r.staffId ?? r.name}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm text-fg">{r.name}</span>
                  <span className="font-display text-sm text-muted">
                    {nok(r.actual)} / {nok(r.target)}
                    <span className={"ml-2 font-semibold " + pctTone(r.pct)}>{r.pct} %</span>
                  </span>
                </div>
                {/* Bar viser andel av mål (kappet 100 %); tallene over viser faktisk. */}
                <ProgressBar value={Math.min(100, r.pct)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kundeantall-mål (fra daily_targets) */}
      {g.customerTarget > 0 && (
        <div className="border border-line bg-surface p-6">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Kundeantall</h2>
              <p className="text-xs text-muted">Fullførte timer mot dagsmål (sum måned)</p>
            </div>
            <span className="text-sm text-muted">
              {g.customerActual} / {g.customerTarget}
            </span>
          </div>
          <ProgressBar value={custPct} />
        </div>
      )}
    </div>
  );
}
