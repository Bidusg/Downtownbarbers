import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { TripletexSyncButton } from "@/components/admin/TripletexSyncButton";
import { KontoplanTable } from "@/components/admin/KontoplanTable";
import { getRevenueSeries, getRevenueSummary } from "@/lib/dashboard-queries";
import {
  getTripletexResultat,
  getTripletexKontoplan,
  getTripletexSaldobalanse,
  getLastSync,
} from "@/lib/tripletex/queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

/** Liten utfoldbar chevron (roterer når <details> er åpen). */
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Én sammendragslinje i resultatregnskapet: hovedpost + totalbeløp, som kan
 * foldes ut for å vise kontoene bak. Holder siden kort som standard.
 */
function StatementGroup({
  label,
  total,
  rows,
}: {
  label: string;
  total: number;
  rows: { number: number | null; name: string; amount: number }[];
}) {
  if (rows.length === 0) return null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-3 hover:bg-surface-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Chevron />
          {label}
          <span className="text-xs text-muted">({rows.length})</span>
        </span>
        <span className="tabular-nums text-sm">{nok(total)}</span>
      </summary>
      <div className="bg-surface-2/40">
        {rows.map((r) => (
          <div
            key={`${r.number}-${r.name}`}
            className="flex items-center justify-between py-2 pr-6 pl-12 text-sm text-muted"
          >
            <span>
              <span className="tabular-nums text-fg-soft">{r.number ?? "—"}</span>{" "}
              {r.name || "—"}
            </span>
            <span className="tabular-nums">{nok(r.amount)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

/** Formater siste synk-tidspunkt til «Sist synket: …» (Oslo-tid), ellers null. */
function formatLastSync(
  ls: { finished_at: string | null; status: string | null } | null,
): string | null {
  if (!ls?.finished_at) return null;
  const d = new Date(ls.finished_at);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    dateStyle: "short",
    timeStyle: "short",
  });
  return `Sist synket: ${s}`;
}

export default async function AdminRegnskap({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.periode === "months" ? "months" : "days";
  const year = String(new Date().getFullYear());

  const [series, sum, resultat, kontoplan, saldobalanse, lastSyncRaw] =
    await Promise.all([
      getRevenueSeries(period),
      getRevenueSummary(),
      getTripletexResultat(year),
      getTripletexKontoplan(),
      getTripletexSaldobalanse(year),
      getLastSync(),
    ]);

  const maxBarber = Math.max(1, ...sum.perBarber.map((b) => b.nok));
  const lastSync = formatLastSync(lastSyncRaw);
  const hasTripletex = resultat.rows.length > 0 || kontoplan.length > 0;

  // Kontoer med faktisk bevegelse/saldo i perioden – brukes til å vise kun
  // relevante kontoer i kontoplanen (hele NS 4102 er flere hundre rader).
  const movementNumbers = saldobalanse
    .filter(
      (b) =>
        (b.balance_change ?? 0) !== 0 ||
        (b.balance_out ?? 0) !== 0 ||
        (b.balance_in ?? 0) !== 0,
    )
    .map((b) => b.account_number);

  // Gruppér resultatlinjene til en kompakt oppstilling på hovedposter.
  // Detaljene (kontoene bak) kan foldes ut per linje, så siden er kort som standard.
  const incomeRows = resultat.rows.filter((r) => r.kind === "INCOME");
  const costRows = resultat.rows.filter((r) => r.kind === "COST");
  const inRange = (n: number | null, min: number, max: number) =>
    n != null && n >= min && n <= max;
  const costGroups = [
    { label: "Varekostnad", min: 4000, max: 4999 },
    { label: "Lønn og personal", min: 5000, max: 5999 },
    { label: "Andre driftskostnader", min: 6000, max: 7999 },
  ]
    .map((g) => {
      const rows = costRows.filter((r) => inRange(r.number, g.min, g.max));
      return { label: g.label, rows, total: rows.reduce((a, r) => a + r.amount, 0) };
    })
    .filter((g) => g.rows.length > 0);
  // Fang opp evt. kostnadslinjer utenfor 4000–7999 så ingen beløp forsvinner.
  const groupedRows = new Set(costGroups.flatMap((g) => g.rows));
  const otherCost = costRows.filter((r) => !groupedRows.has(r));
  if (otherCost.length > 0) {
    costGroups.push({
      label: "Andre kostnader",
      rows: otherCost,
      total: otherCost.reduce((a, r) => a + r.amount, 0),
    });
  }
  const hasFinans =
    resultat.finansinntekter !== 0 || resultat.finanskostnader !== 0;

  const tab = (key: "days" | "months", label: string) => (
    <a
      href={`/admin/regnskap?periode=${key}`}
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
      <PageHeader
        title="Regnskap & rapporter"
        description="Regnskapstall hentes fra Tripletex. Kassesalget nedenfor er driftstall fra kassa."
        actions={
          <>
            <a
              href="/admin/rapporter/eksport/xlsx?type=regnskap"
              className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Regnskap (Excel)
            </a>
            <a
              href="/admin/rapporter/eksport?type=regnskap"
              className="inline-flex items-center gap-1.5 border border-line-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              CSV
            </a>
          </>
        }
      />

      {/* ───────────────────────── Regnskap (fra Tripletex) ───────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Regnskap (fra Tripletex)</h2>
            <p className="text-xs text-muted">Bokførte tall hittil i år ({year}).</p>
          </div>
          <TripletexSyncButton lastSync={lastSync} />
        </div>

        {!hasTripletex ? (
          <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
            <span className="mt-0.5 text-accent-soft">●</span>
            <p className="text-muted">
              <strong className="text-fg">Ingen Tripletex-data synket ennå</strong> — trykk Synk nå.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Omsetning" value={nok(resultat.omsetning)} sub="hittil i år" />
              <StatTile label="Driftsresultat" value={nok(resultat.driftsresultat)} sub="hittil i år" />
              <StatTile label="Resultat før skatt" value={nok(resultat.resultatForSkatt)} sub="drift + finans" />
              <StatTile label="Utgående mva" value={nok(resultat.utgaaendeMva)} sub="perioden" />
            </div>

            {/* Kompakt resultatregnskap: hovedposter med utfoldbare kontoer */}
            <div className="border border-line bg-surface">
              <div className="border-b border-line px-6 py-4">
                <h3 className="font-display text-lg font-bold">Resultatregnskap</h3>
                <p className="text-xs text-muted">
                  Hittil i år ({year}). Klikk en linje for å se kontoene bak.
                </p>
              </div>
              <div className="divide-y divide-line">
                <StatementGroup
                  label="Inntekter"
                  total={resultat.omsetning}
                  rows={incomeRows}
                />
                {costGroups.map((g) => (
                  <StatementGroup
                    key={g.label}
                    label={g.label}
                    total={g.total}
                    rows={g.rows}
                  />
                ))}
                <div className="flex items-center justify-between px-6 py-3 font-semibold">
                  <span>Driftsresultat</span>
                  <span className="tabular-nums">{nok(resultat.driftsresultat)}</span>
                </div>
                {hasFinans && (
                  <>
                    <div className="flex items-center justify-between px-6 py-2 text-sm text-muted">
                      <span>+ Finansinntekter</span>
                      <span className="tabular-nums">{nok(resultat.finansinntekter)}</span>
                    </div>
                    <div className="flex items-center justify-between px-6 py-2 text-sm text-muted">
                      <span>− Finanskostnader</span>
                      <span className="tabular-nums">{nok(resultat.finanskostnader)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between bg-surface-2/40 px-6 py-3 font-semibold">
                  <span>Resultat før skatt</span>
                  <span className="tabular-nums">{nok(resultat.resultatForSkatt)}</span>
                </div>
              </div>
              <div className="border-t border-line px-6 py-3 text-xs text-muted">
                Beløp uten fortegn. Skatt (kontoklasse 83) er ikke trukket fra.
                Utgående mva i perioden: {nok(resultat.utgaaendeMva)}.
              </div>
            </div>

            {/* Full kontoplan – sammenfoldet, åpnes ved behov */}
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-fg hover:text-accent-soft">
                <Chevron />
                Vis full kontoplan
              </summary>
              <div className="mt-3">
                <KontoplanTable
                  accounts={kontoplan.map((k) => ({
                    tripletex_id: k.tripletex_id,
                    number: k.number,
                    name: k.name,
                    type: k.type,
                    ledger_type: k.ledger_type,
                  }))}
                  movementNumbers={movementNumbers}
                />
              </div>
            </details>
          </>
        )}
      </section>

      {/* ───────────────────────── Kassesalg (drift) ───────────────────────── */}
      <section className="space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold">Kassesalg (drift)</h2>
          <p className="text-xs text-muted">
            Driftstall fra kassa (ikke bokført regnskap). Fylles etter hvert som salg
            registreres.
          </p>
        </div>

        {!sum.hasData && (
          <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
            <span className="mt-0.5 text-accent-soft">●</span>
            <p className="text-muted">
              <strong className="text-fg">Ingen salg registrert enda.</strong>{" "}
              Tallene fylles automatisk etter hvert som timer fullføres og betales i
              kassen. Historikk fra Fixit importeres når vi får en salgseksport.
            </p>
          </div>
        )}

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
            <RevenueChart data={series} drillBase="/admin/omsetning" period={period} />
          </div>
        </div>

        <div className="border border-line bg-surface p-6">
          <h3 className="mb-5 font-display text-lg font-bold">Omsetning per barber</h3>
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
      </section>
    </div>
  );
}
