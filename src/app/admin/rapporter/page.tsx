import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RevenueChart } from "@/components/admin/RevenueChart";
import {
  resolveRange,
  getRevenueByGranularity,
  getRevenueBreakdown,
  getCategoryBreakdown,
  getVatReport,
  getSlowMovers,
  GRANULARITIES,
  type Granularity,
} from "@/lib/report-queries";
import { getRevisitStats, getTopCustomers } from "@/lib/analytics-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

/* Hurtigvalg for periode (Oslo-datoer). */
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

export default async function AdminRapporter({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; g?: string }>;
}) {
  const sp = await searchParams;
  const r = resolveRange(sp.from, sp.to);
  const g: Granularity =
    (GRANULARITIES.find((x) => x.key === sp.g)?.key as Granularity) ?? "day";

  const [buckets, brk, cat, vat, slow, revisit, top] = await Promise.all([
    getRevenueByGranularity(r, g),
    getRevenueBreakdown(r),
    getCategoryBreakdown(r),
    getVatReport(r),
    getSlowMovers(r),
    getRevisitStats(r),
    getTopCustomers(r, 20),
  ]);
  const maxVisitDist = Math.max(1, ...revisit.distribution.map((d) => d.count));

  const base = `/admin/rapporter?from=${r.from}&to=${r.to}`;
  const eksport = (type: string, extra = "") =>
    `/admin/rapporter/eksport?type=${type}&from=${r.from}&to=${r.to}${extra}`;
  const chartData = buckets.map((b) => ({ day: b.label, nok: b.nok }));
  const maxBarber = Math.max(1, ...brk.byBarber.map((b) => b.nok));
  const maxCat = Math.max(1, ...cat.rows.map((c) => c.nok));

  const csvBtn = (href: string) => (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 border border-line-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      CSV
    </a>
  );

  const sectionHead = (title: string, href: string) => (
    <div className="flex items-center justify-between border-b border-line px-6 py-4">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {csvBtn(href)}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Rapporter</h1>
          <p className="mt-1 text-sm text-muted">
            Periode: <span className="text-fg">{r.label}</span>
          </p>
        </div>
      </div>

      {/* Periodevelger */}
      <div className="border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {presets().map((p) => {
            const active = p.from === r.from && p.to === r.to;
            return (
              <a
                key={p.label}
                href={`/admin/rapporter?from=${p.from}&to=${p.to}&g=${g}`}
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
          <input type="hidden" name="g" value={g} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Fra
            <input
              type="date"
              name="from"
              defaultValue={r.from}
              className="border border-line bg-canvas px-3 py-2 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Til
            <input
              type="date"
              name="to"
              defaultValue={r.to}
              className="border border-line bg-canvas px-3 py-2 text-sm text-fg"
            />
          </label>
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Oppdater
          </button>
        </form>
      </div>

      {/* Nøkkeltall */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Omsetning" value={nok(brk.total)} sub="inkl. Zettle" />
        <StatTile label="Antall salg" value={String(brk.saleCount)} />
        <StatTile label="Snitt per salg" value={nok(brk.avg)} />
        <StatTile label={`Herav MVA (${vat.rate}%)`} value={nok(vat.total.vat)} />
      </div>

      {/* Omsetning over tid */}
      <div className="border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Omsetning over tid</h2>
          {csvBtn(eksport("omsetning", `&g=${g}`))}
        </div>
        <div className="flex flex-wrap gap-1 border-b border-line px-4">
          {GRANULARITIES.map((gr) => (
            <a
              key={gr.key}
              href={`${base}&g=${gr.key}`}
              className={
                "border-b-2 px-3 py-2 text-sm transition-colors " +
                (g === gr.key
                  ? "border-accent-soft font-semibold text-fg"
                  : "border-transparent text-muted hover:text-fg")
              }
            >
              {gr.label}
            </a>
          ))}
        </div>
        <div className="p-6">
          {buckets.every((b) => b.nok === 0) ? (
            <p className="py-8 text-center text-sm text-muted">Ingen omsetning i perioden.</p>
          ) : (
            <RevenueChart data={chartData} />
          )}
        </div>
      </div>

      {/* Per barber */}
      <div className="border border-line bg-surface">
        {sectionHead("Omsetning per barber", eksport("barber"))}
        <div className="p-6">
          {brk.byBarber.length === 0 ? (
            <p className="text-sm text-muted">Ingen salg i perioden.</p>
          ) : (
            <div className="space-y-5">
              {brk.byBarber.map((b) => (
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

      {/* Per behandlingskategori */}
      <div className="border border-line bg-surface">
        {sectionHead("Omsetning per behandlingskategori", eksport("kategori"))}
        <div className="p-6">
          {cat.rows.length === 0 ? (
            <p className="text-sm text-muted">Ingen behandlingssalg i perioden.</p>
          ) : (
            <div className="space-y-5">
              {cat.rows.map((c) => (
                <ProgressBar
                  key={c.category}
                  value={Math.round((c.nok / maxCat) * 100)}
                  label={`${c.category} (${c.count})`}
                  caption={nok(c.nok)}
                />
              ))}
            </div>
          )}
          {cat.productExternal > 0 && (
            <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
              Varesalg via Zettle (ikke fordelt på kategori):{" "}
              <span className="font-medium text-fg">{nok(cat.productExternal)}</span>
            </p>
          )}
        </div>
      </div>

      {/* MVA */}
      <div className="border border-line bg-surface">
        {sectionHead("MVA-oppsummering", eksport("mva"))}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-6 py-3 font-medium">Grunnlag</th>
                <th className="px-6 py-3 text-right font-medium">Brutto</th>
                <th className="px-6 py-3 text-right font-medium">Netto eks. mva</th>
                <th className="px-6 py-3 text-right font-medium">MVA {vat.rate}%</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Tjenester (kasse)", v: vat.services },
                { label: "Varesalg (Zettle)", v: vat.external },
              ].map((row) => (
                <tr key={row.label} className="border-b border-line">
                  <td className="px-6 py-3 text-fg-soft">{row.label}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{nok(row.v.gross)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{nok(row.v.net)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{nok(row.v.vat)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-6 py-3">Totalt</td>
                <td className="px-6 py-3 text-right tabular-nums">{nok(vat.total.gross)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{nok(vat.total.net)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{nok(vat.total.vat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Hyllevarmere */}
      <div className="border border-line bg-surface">
        {sectionHead("Hyllevarmere (tregt varelager)", eksport("hyllevarmere"))}
        {slow.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen aktive produkter registrert.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Produkt</th>
                  <th className="px-6 py-3 text-right font-medium">På lager</th>
                  <th className="px-6 py-3 text-right font-medium">Solgt i perioden</th>
                  <th className="px-6 py-3 text-right font-medium">Pris</th>
                </tr>
              </thead>
              <tbody>
                {slow.map((p) => (
                  <tr key={p.name} className="border-b border-line last:border-0">
                    <td className="px-6 py-3">{p.name}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{p.stock}</td>
                    <td className={"px-6 py-3 text-right tabular-nums " + (p.sold === 0 ? "text-accent-soft" : "text-fg-soft")}>
                      {p.sold}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">{nok(p.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gjenbesøk */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Gjenbesøk</h2>
        </div>
        <div className="grid gap-4 border-b border-line p-6 sm:grid-cols-4">
          <StatTile label="Retur-andel" value={`${revisit.returnRatePct} %`} sub="av kunder i perioden" />
          <StatTile label="Nye kunder" value={String(revisit.newCustomers)} sub="første besøk" />
          <StatTile label="Gjengangere" value={String(revisit.returning)} sub="besøkt før" />
          <StatTile label="Snitt mellom besøk" value={`${revisit.avgDaysBetween} dg`} />
        </div>
        <div className="p-6">
          <p className="mb-4 text-sm text-muted">
            Besøksfrekvens (livstid) · snitt {revisit.avgVisitsLifetime} besøk per kunde
          </p>
          <div className="space-y-4">
            {revisit.distribution.map((d) => (
              <div key={d.label} className="flex items-center gap-4">
                <span className="w-20 text-sm text-fg-soft">{d.label}</span>
                <span className="h-2.5 flex-1 overflow-hidden bg-surface-2">
                  <span className="block h-full bg-accent-soft" style={{ width: `${Math.round((d.count / maxVisitDist) * 100)}%` }} />
                </span>
                <span className="w-12 text-right text-sm font-medium tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gullkunder */}
      <div className="border border-line bg-surface">
        {sectionHead("Gullkunder (topp 20)", eksport("gullkunder"))}
        {top.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen kunderegistrerte salg i perioden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">#</th>
                  <th className="px-6 py-3 font-medium">Kunde</th>
                  <th className="px-6 py-3 text-right font-medium">Besøk</th>
                  <th className="px-6 py-3 text-right font-medium">Omsetning</th>
                </tr>
              </thead>
              <tbody>
                {top.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 tabular-nums text-muted">{i + 1}</td>
                    <td className="px-6 py-3">{c.name}</td>
                    <td className="px-6 py-3 text-right tabular-nums">{c.visits}</td>
                    <td className="px-6 py-3 text-right font-medium tabular-nums">{nok(c.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
