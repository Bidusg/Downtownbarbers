import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
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
      <PageHeader
        title="Rapporter"
        description={`Periode: ${r.label}`}
        actions={
          <>
            <a
              href={`/admin/rapporter/produktivitet?from=${r.from}&to=${r.to}`}
              className="border border-line-2 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
            >
              Produktivitet per barber →
            </a>
            <a
              href="/admin/rapporter/grunndata"
              className="border border-line-2 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
            >
              Eksporter alt (grunndata) ↓
            </a>
          </>
        }
      />

      {/* Periodevelger */}
      <Card>
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
          <Field label="Fra">
            <Input type="date" name="from" defaultValue={r.from} />
          </Field>
          <Field label="Til">
            <Input type="date" name="to" defaultValue={r.to} />
          </Field>
          <Button type="submit" className="px-4 py-2 text-sm">
            Oppdater
          </Button>
        </form>
      </Card>

      {/* Nøkkeltall */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Omsetning" value={nok(brk.total)} />
        <StatTile label="Antall salg" value={String(brk.saleCount)} />
        <StatTile label="Snitt per salg" value={nok(brk.avg)} />
        <StatTile label={`Herav MVA (${vat.rate}%)`} value={nok(vat.total.vat)} />
      </div>

      {/* Omsetning over tid */}
      <Card padded={false}>
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
            <EmptyState description="Ingen omsetning i perioden." />
          ) : (
            <RevenueChart data={chartData} />
          )}
        </div>
      </Card>

      {/* Per barber */}
      <Card padded={false}>
        {sectionHead("Omsetning per barber", eksport("barber"))}
        <div className="p-6">
          {brk.byBarber.length === 0 ? (
            <EmptyState description="Ingen salg i perioden." />
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
      </Card>

      {/* Per behandlingskategori */}
      <Card padded={false}>
        {sectionHead("Omsetning per behandlingskategori", eksport("kategori"))}
        <div className="p-6">
          {cat.rows.length === 0 ? (
            <EmptyState description="Ingen behandlingssalg i perioden." />
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
        </div>
      </Card>

      {/* MVA */}
      <Card padded={false}>
        {sectionHead("MVA-oppsummering", eksport("mva"))}
        <Table>
          <THead>
            <Tr head>
              <Th>Grunnlag</Th>
              <Th align="right">Brutto</Th>
              <Th align="right">Netto eks. mva</Th>
              <Th align="right">MVA {vat.rate}%</Th>
            </Tr>
          </THead>
          <TBody>
            {[
              { label: "Tjenester (kasse)", v: vat.services },
            ].map((row) => (
              <Tr key={row.label}>
                <Td className="text-fg-soft">{row.label}</Td>
                <Td align="right" nums>{nok(row.v.gross)}</Td>
                <Td align="right" nums>{nok(row.v.net)}</Td>
                <Td align="right" nums>{nok(row.v.vat)}</Td>
              </Tr>
            ))}
            <Tr className="font-semibold">
              <Td>Totalt</Td>
              <Td align="right" nums>{nok(vat.total.gross)}</Td>
              <Td align="right" nums>{nok(vat.total.net)}</Td>
              <Td align="right" nums>{nok(vat.total.vat)}</Td>
            </Tr>
          </TBody>
        </Table>
      </Card>

      {/* Hyllevarmere */}
      <Card padded={false}>
        {sectionHead("Hyllevarmere (tregt varelager)", eksport("hyllevarmere"))}
        <Table>
          <THead>
            <Tr head>
              <Th>Produkt</Th>
              <Th align="right">På lager</Th>
              <Th align="right">Solgt i perioden</Th>
              <Th align="right">Pris</Th>
            </Tr>
          </THead>
          <TBody>
            {slow.length === 0 ? (
              <TableEmpty colSpan={4}>Ingen aktive produkter registrert.</TableEmpty>
            ) : (
              slow.map((p) => (
                <Tr key={p.name}>
                  <Td>{p.name}</Td>
                  <Td align="right" nums>{p.stock}</Td>
                  <Td align="right" nums className={p.sold === 0 ? "text-accent-soft" : "text-fg-soft"}>
                    {p.sold}
                  </Td>
                  <Td align="right" nums>{nok(p.price)}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {/* Gjenbesøk */}
      <Card padded={false}>
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
      </Card>

      {/* Gullkunder */}
      <Card padded={false}>
        {sectionHead("Gullkunder (topp 20)", eksport("gullkunder"))}
        <Table>
          <THead>
            <Tr head>
              <Th>#</Th>
              <Th>Kunde</Th>
              <Th align="right">Besøk</Th>
              <Th align="right">Omsetning</Th>
            </Tr>
          </THead>
          <TBody>
            {top.length === 0 ? (
              <TableEmpty colSpan={4}>Ingen kunderegistrerte salg i perioden.</TableEmpty>
            ) : (
              top.map((c, i) => (
                <Tr key={`${c.name}-${i}`}>
                  <Td nums muted>{i + 1}</Td>
                  <Td>{c.name}</Td>
                  <Td align="right" nums>{c.visits}</Td>
                  <Td align="right" nums className="font-medium">{nok(c.spend)}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
