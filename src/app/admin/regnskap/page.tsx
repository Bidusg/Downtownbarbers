import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { TripletexSyncButton } from "@/components/admin/TripletexSyncButton";
import { getRevenueSeries, getRevenueSummary } from "@/lib/dashboard-queries";
import {
  getTripletexResultat,
  getTripletexKontoplan,
  getLastSync,
} from "@/lib/tripletex/queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

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

  const [series, sum, resultat, kontoplan, lastSyncRaw] = await Promise.all([
    getRevenueSeries(period),
    getRevenueSummary(),
    getTripletexResultat(year),
    getTripletexKontoplan(),
    getLastSync(),
  ]);

  const maxBarber = Math.max(1, ...sum.perBarber.map((b) => b.nok));
  const lastSync = formatLastSync(lastSyncRaw);
  const hasTripletex = resultat.rows.length > 0 || kontoplan.length > 0;

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
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label="Omsetning" value={nok(resultat.omsetning)} sub="hittil i år" />
              <StatTile label="Resultat" value={nok(resultat.resultat)} sub="hittil i år" />
              <StatTile label="Utgående mva" value={nok(resultat.utgaaendeMva)} sub="perioden" />
            </div>

            {/* Resultat per konto */}
            <div className="border border-line bg-surface">
              <div className="border-b border-line px-6 py-4">
                <h3 className="font-display text-lg font-bold">Resultat per konto</h3>
                <p className="text-xs text-muted">
                  Inntekts- og kostnadskontoer, beløp vist positivt.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-6 py-3 font-medium">Konto</th>
                      <th className="px-6 py-3 font-medium">Navn</th>
                      <th className="px-6 py-3 font-medium">Type</th>
                      <th className="px-6 py-3 text-right font-medium">Beløp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultat.rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-muted">
                          Ingen resultatlinjer i perioden.
                        </td>
                      </tr>
                    ) : (
                      resultat.rows.map((r) => (
                        <tr key={`${r.number}-${r.name}`} className="border-b border-line last:border-0">
                          <td className="px-6 py-3 tabular-nums text-fg-soft">{r.number ?? "—"}</td>
                          <td className="px-6 py-3">{r.name || "—"}</td>
                          <td className="px-6 py-3">
                            <span
                              className={
                                "rounded px-2 py-0.5 text-[11px] font-semibold " +
                                (r.kind === "INCOME"
                                  ? "bg-accent-soft/15 text-accent-soft"
                                  : "bg-surface-2 text-muted")
                              }
                            >
                              {r.kind === "INCOME" ? "Inntekt" : "Kostnad"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums">{nok(r.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Kontoplan fra Tripletex */}
            <div className="border border-line bg-surface">
              <div className="border-b border-line px-6 py-4">
                <h3 className="font-display text-lg font-bold">Kontoplan</h3>
                <p className="text-xs text-muted">Synket fra Tripletex.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-6 py-3 font-medium">Konto</th>
                      <th className="px-6 py-3 font-medium">Navn</th>
                      <th className="px-6 py-3 font-medium">Type</th>
                      <th className="px-6 py-3 font-medium">Hovedbok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kontoplan.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-muted">
                          Ingen kontoer synket.
                        </td>
                      </tr>
                    ) : (
                      kontoplan.map((k) => (
                        <tr key={k.tripletex_id} className="border-b border-line last:border-0">
                          <td className="px-6 py-3 tabular-nums text-fg-soft">{k.number ?? "—"}</td>
                          <td className="px-6 py-3">{k.name ?? "—"}</td>
                          <td className="px-6 py-3 text-muted">{k.type ?? "—"}</td>
                          <td className="px-6 py-3 text-muted">{k.ledger_type ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
