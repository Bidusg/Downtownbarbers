import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { getRevenueSeries, getRevenueSummary } from "@/lib/dashboard-queries";
import { deriveIncomeLedger, accountPlan } from "@/lib/accounting";
import { osloMonthRange } from "@/lib/period";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

export default async function AdminRegnskap({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; mnd?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.periode === "months" ? "months" : "days";
  const mnd = osloMonthRange(sp.mnd);
  const [series, sum, ledger] = await Promise.all([
    getRevenueSeries(period),
    getRevenueSummary(),
    deriveIncomeLedger(mnd.fromIso, mnd.toIso),
  ]);
  const maxBarber = Math.max(1, ...sum.perBarber.map((b) => b.nok));
  const plan = accountPlan();

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Regnskap & rapporter</h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <span className="text-xs text-muted">denne måneden</span>
        </div>
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

      {/* Hovedbok (avledet, inntektssiden) — Fase 1 av regnskapsmodulen */}
      <div className="border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">Hovedbok — {mnd.label}</h2>
            <p className="text-xs text-muted">Avledet konto-oppstilling (inntektssiden)</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/admin/regnskap?mnd=${mnd.prev}`} className="border border-line px-2 py-1 text-sm text-muted hover:text-fg" aria-label="Forrige måned">←</a>
            <a href={`/admin/regnskap?mnd=${mnd.next}`} className="border border-line px-2 py-1 text-sm text-muted hover:text-fg" aria-label="Neste måned">→</a>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-6 py-3 font-medium">Konto</th>
                <th className="px-6 py-3 font-medium">Tekst</th>
                <th className="px-6 py-3 text-right font-medium">Debet</th>
                <th className="px-6 py-3 text-right font-medium">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {ledger.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted">Ingen salg denne måneden.</td>
                </tr>
              ) : (
                ledger.lines.map((l) => (
                  <tr key={l.account} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 tabular-nums text-fg-soft">{l.account}</td>
                    <td className="px-6 py-3">{l.name}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{l.debit ? nok(l.debit) : "—"}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{l.credit ? nok(l.credit) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
            {ledger.lines.length > 0 && (
              <tfoot>
                <tr className="border-t border-line-2 font-semibold">
                  <td className="px-6 py-3" colSpan={2}>
                    Sum {ledger.balanced ? "· balanserer ✓" : "· ubalanse!"}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{nok(ledger.totalDebit)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{nok(ledger.totalCredit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="border-t border-line px-6 py-3 text-xs text-muted">
          Avledet oppstilling av inntektssiden — omsetning omregnet til konto/mva etter
          kontoplanen under. Selve bokføringen skjer i <strong className="text-fg">Tripletex</strong>:
          dagsoppgjøret sendes dit som ubokført utkast ved kasseoppgjør, og revisor bokfører der.
          {" "}{ledger.count} salg · eks. mva {nok(ledger.eks)} · mva {nok(ledger.mva)}
          {ledger.productEks > 0
            ? ` · tjenester ${nok(ledger.serviceEks)} · varer ${nok(ledger.productEks)}`
            : ""}
          .
        </p>
      </div>

      {/* Kontoplan — Fixit-stil oversikt over hvilke kontoer systemet konterer på.
          Samme kilde som dagsbilaget, så den er alltid i takt. */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Kontoplan</h2>
          <p className="text-xs text-muted">
            Slik konteres salget mot Tripletex.{" "}
            {plan.vatMode === "account"
              ? "Mva regnes av Tripletex via mva-kode 3 på salgskontoene."
              : "Mva føres eksplisitt til konto 2700."}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-6 py-3 font-medium">Konto</th>
                <th className="px-6 py-3 font-medium">Navn</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Mva-kode</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.account} className="border-b border-line last:border-0">
                  <td className="px-6 py-3 tabular-nums text-fg-soft">{r.account}</td>
                  <td className="px-6 py-3">{r.name}</td>
                  <td className="px-6 py-3">
                    <span
                      className={
                        "rounded px-2 py-0.5 text-[11px] font-semibold " +
                        (r.kind === "salg"
                          ? "bg-accent-soft/15 text-accent-soft"
                          : "bg-surface-2 text-muted")
                      }
                    >
                      {r.kind === "salg" ? "Salg" : "Betaling"}
                    </span>
                  </td>
                  <td className="px-6 py-3 tabular-nums text-muted">{r.vatCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-6 py-3 text-xs text-muted">
          Bekreftet av regnskapsfører. Kontoene 3001/3002/3020 må ha mva-kode 3 (25 %) satt
          i Tripletex — det styrer Tripletex, ikke kassa.
        </p>
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
    </div>
  );
}
