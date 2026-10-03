import Link from "next/link";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { resolveRange, getRelationSummary } from "@/lib/report-queries";
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

  const [scores, noShow, relation] = await Promise.all([
    getBarberScores(r),
    getNoShowOverview(r),
    getRelationSummary(r),
  ]);
  const relTotal = relation.venn.count + relation.familie.count;

  const eksport = `/admin/rapporter/eksport?type=produktivitet&from=${r.from}&to=${r.to}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Produktivitet per barber"
        description={`Periode: ${r.label}`}
        actions={
          <Link
            href={`/admin/rapporter?from=${r.from}&to=${r.to}`}
            className="border border-line-2 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
          >
            ← Rapporter
          </Link>
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

      {/* Venn/familie-salg */}
      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Venn/familie-salg</h2>
          <span className="text-sm text-muted">
            {relTotal} salg i perioden
          </span>
        </div>
        {relTotal === 0 ? (
          <EmptyState description="Ingen venn-/familie-salg registrert i perioden." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Venn"
              value={String(relation.venn.count)}
              sub={nok(relation.venn.nok)}
            />
            <StatTile
              label="Familie"
              value={String(relation.familie.count)}
              sub={nok(relation.familie.nok)}
            />
          </div>
        )}
      </Card>

      {/* Salong-sammendrag */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatTile label="Timeutnyttelse" value={`${scores.salon.utilizationPct} %`} sub={`${scores.salon.bookedHours} av ${scores.salon.capacityHours} t (turnus)`} />
        <StatTile label="Omsetning" value={nok(scores.salon.revenue)} sub="inkl. mva" />
        <StatTile label="Fullførte timer" value={String(scores.salon.completed)} sub="i perioden" />
        <StatTile label="Ikke møtt" value={`${scores.salon.noShowPct} %`} sub={`${scores.salon.noShow} av ${scores.salon.completed + scores.salon.noShow}`} />
      </div>

      {/* Per barber scorecard */}
      <Card padded={false}>
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
            Last ned CSV
          </a>
        </div>
        <Table>
          <THead>
            <Tr head>
              <Th>Barber</Th>
              <Th align="right">Omsetning</Th>
              <Th align="right">Salg</Th>
              <Th align="right">Snitt</Th>
              <Th align="right">Fullført</Th>
              <Th align="right">Rebooking</Th>
              <Th align="right">Ikke møtt</Th>
              <Th align="right">Utnyttelse</Th>
            </Tr>
          </THead>
          <TBody>
            {scores.rows.length === 0 ? (
              <TableEmpty colSpan={8}>Ingen aktive barberer i perioden.</TableEmpty>
            ) : (
              scores.rows.map((b) => (
                <Tr key={b.staffId}>
                  <Td>
                    <span className="font-medium text-fg">{b.name}</span>
                    {b.title && <span className="block text-xs text-muted">{b.title}</span>}
                  </Td>
                  <Td align="right" nums className="font-medium">{nok(b.revenue)}</Td>
                  <Td align="right" nums muted>{b.saleCount}</Td>
                  <Td align="right" nums muted>{nok(b.avgSale)}</Td>
                  <Td align="right" nums>{b.completed}</Td>
                  <Td align="right" nums>{b.rebookedPct} %</Td>
                  <Td align="right" nums className={b.noShow > 0 ? "text-danger" : "text-muted"}>
                    {b.noShow} ({b.noShowPct} %)
                  </Td>
                  <Td align="right">
                    <span className={"font-display font-bold tabular-nums " + utilTone(b.utilizationPct)}>
                      {b.utilizationPct} %
                    </span>
                    <span className="block text-xs text-muted tabular-nums">
                      {b.bookedHours} / {b.capacityHours} t
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {/* No-show-oversikt */}
      <div className="grid gap-8 lg:grid-cols-2">
        <Card padded={false}>
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Ikke møtt per barber</h2>
          </div>
          <Table>
            <TBody>
              {noShow.perBarber.length === 0 ? (
                <TableEmpty colSpan={2}>Ingen fullførte/ikke-møtt-timer i perioden.</TableEmpty>
              ) : (
                noShow.perBarber.map((b) => (
                  <Tr key={b.name}>
                    <Td>{b.name}</Td>
                    <Td align="right" nums className={b.count > 0 ? "text-danger" : "text-muted"}>
                      {b.count} <span className="text-xs text-muted">({b.pct} %)</span>
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </Card>

        <Card padded={false}>
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Gjengangere (≥ 2 ikke møtt)</h2>
          </div>
          <Table>
            <TBody>
              {noShow.repeatCustomers.length === 0 ? (
                <TableEmpty colSpan={2}>Ingen kunder med gjentatte no-show i perioden.</TableEmpty>
              ) : (
                noShow.repeatCustomers.map((c) => (
                  <Tr key={c.name}>
                    <Td>{c.name}</Td>
                    <Td align="right" nums className="font-medium text-danger">{c.count}</Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
