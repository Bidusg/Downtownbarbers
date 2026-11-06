import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { resolveRange } from "@/lib/report-queries";
import { getKpiOverview } from "@/lib/kpi-queries";
import { getRevenueReport, parseFilters, type RevFilters } from "@/lib/kpi-revenue";
import { getStaffOptions } from "@/lib/ops-queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

/** Endring mot forrige periode som tekst. */
function delta(cur: number | null, prev: number | null): string {
  if (cur == null || prev == null) return "";
  if (prev === 0) return cur === 0 ? "uendret" : "ny";
  const p = Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  return `${p > 0 ? "+" : ""}${String(p).replace(".", ",")} % mot forrige`;
}

/** Query-streng for filtrene (beholdes når periode endres). */
function filterQs(f: RevFilters): string {
  const q = new URLSearchParams();
  q.set("kilde", f.source);
  q.set("mva", f.vat);
  q.set("type", f.type);
  if (f.barber) q.set("barber", f.barber);
  if (f.method) q.set("betaling", f.method);
  q.set("kanal", f.channel);
  return q.toString();
}

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
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const r = resolveRange(sp.from, sp.to);
  const f = parseFilters(sp);
  const [k, rev, staff] = await Promise.all([
    getKpiOverview(r),
    getRevenueReport(r, f),
    getStaffOptions({ includeInactive: true }),
  ]);
  const t = rev.totals;
  const vatLabel = f.vat === "eks" ? "eks. mva" : "inkl. mva";
  const maxDay = Math.max(1, ...rev.byDay.map((d) => d.total));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Nøkkeltall"
        description={`Periode: ${r.label}`}
      />

      {/* Periodevelger */}
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {presets().map((p) => {
            const active = p.from === r.from && p.to === r.to;
            return (
              <a
                key={p.label}
                href={`/admin/nokkeltall?from=${p.from}&to=${p.to}&${filterQs(f)}`}
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
        <form method="get" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Fra
              <Input type="date" name="from" defaultValue={r.from} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Til
              <Input type="date" name="to" defaultValue={r.to} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Kilde
              <Select name="kilde" defaultValue={f.source}>
                <option value="kasse">Kassen (nytt system)</option>
                <option value="historikk">Kassen + importert historikk</option>
                <option value="fixit">Fixit-kasseoppgjør</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Mva
              <Select name="mva" defaultValue={f.vat}>
                <option value="eks">Eks. mva</option>
                <option value="inkl">Inkl. mva</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Type
              <Select name="type" defaultValue={f.type}>
                <option value="alle">Alt salg</option>
                <option value="behandling">Bare behandlinger</option>
                <option value="produkt">Bare varesalg</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Barber
              <Select name="barber" defaultValue={f.barber}>
                <option value="">Alle barbere</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.active === false ? " (sluttet)" : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Betaling
              <Select name="betaling" defaultValue={f.method}>
                <option value="">Alle betalingsmåter</option>
                <option value="kort">Kort</option>
                <option value="vipps">Vipps</option>
                <option value="kontant">Kontant</option>
                <option value="gavekort">Gavekort</option>
                <option value="annet">Annet / ukjent</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Kanal
              <Select name="kanal" defaultValue={f.channel}>
                <option value="alle">Salong + nettbutikk</option>
                <option value="salong">Bare salong</option>
                <option value="nett">Bare nettbutikk</option>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="px-4 py-2 text-sm">
              Oppdater
            </Button>
            <a href={`/admin/nokkeltall?from=${r.from}&to=${r.to}`} className="text-xs text-muted hover:text-fg">
              Nullstill filtre
            </a>
          </div>
        </form>
      </Card>

      {/* Omsetning med filtre */}
      <div>
        <p className="mb-3 text-xs text-muted">
          Omsetning {vatLabel}
          {f.type !== "alle" ? ` · ${f.type === "behandling" ? "bare behandlinger" : "bare varesalg"}` : ""}
          {f.barber ? ` · ${staff.find((s) => s.id === f.barber)?.full_name ?? "valgt barber"}` : ""}
          {f.method ? ` · betalt med ${f.method}` : ""}
          {f.channel !== "alle" ? ` · ${f.channel === "nett" ? "nettbutikk" : "salong"}` : ""}
          {" · "}
          {f.source === "kasse" ? "kilde: kassen" : f.source === "historikk" ? "kilde: kassen + importert historikk" : "kilde: Fixit-kasseoppgjør"}
          {" · "}sammenlignet med {rev.prevLabel}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Omsetning" value={nok(t.total)} sub={delta(t.total, rev.prev.total)} />
          <StatTile
            label="Antall salg"
            value={t.count == null ? "—" : String(t.count)}
            sub={t.count == null ? "ikke i Fixit-oppgjøret" : delta(t.count, rev.prev.count)}
          />
          <StatTile
            label="Snitt per salg"
            value={t.avg == null ? "—" : nok(t.avg)}
            sub={t.avg == null ? "" : delta(t.avg, rev.prev.avg)}
          />
          <StatTile label="Rabatt gitt" value={nok(t.discount)} sub={delta(t.discount, rev.prev.discount)} />
          <StatTile label="Behandlinger" value={nok(t.service)} sub={delta(t.service, rev.prev.service)} />
          <StatTile label="Varesalg" value={nok(t.product)} sub={delta(t.product, rev.prev.product)} />
          <StatTile
            label="Varesalgsandel"
            value={`${String(t.productPct).replace(".", ",")} %`}
            sub="varer av alt salg"
          />
          <StatTile label="Timeutnyttelse" value={`${k.utilization.salonPct} %`} sub="mot turnus" />
        </div>
        {rev.notes.map((n) => (
          <p key={n} className="mt-2 text-xs text-muted">{n}</p>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Per barber (${vatLabel})`} padded={false}>
          <Table>
            <THead>
              <Tr head>
                <Th>Barber</Th>
                <Th align="right">Behandl.</Th>
                <Th align="right">Varer</Th>
                <Th align="right">Totalt</Th>
                <Th align="right">Andel</Th>
              </Tr>
            </THead>
            <TBody>
              {rev.byBarber.length === 0 && <TableEmpty colSpan={5}>Ingen salg med disse filtrene.</TableEmpty>}
              {rev.byBarber.map((b) => (
                <Tr key={b.id}>
                  <Td className="font-medium text-fg">
                    {b.name}
                    {f.source !== "fixit" && <span className="block text-[11px] text-muted">{b.count} salg</span>}
                  </Td>
                  <Td align="right" nums muted>{nok(b.service)}</Td>
                  <Td align="right" nums muted>{nok(b.product)}</Td>
                  <Td align="right" nums className="text-fg">{nok(b.total)}</Td>
                  <Td align="right" nums muted>
                    {t.total > 0 ? `${Math.round((b.total / t.total) * 100)} %` : "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card title={`Per betalingsmåte (${vatLabel})`} padded={false}>
          <Table>
            <THead>
              <Tr head>
                <Th>Betalingsmåte</Th>
                <Th align="right">Beløp</Th>
                <Th align="right">Andel</Th>
              </Tr>
            </THead>
            <TBody>
              {rev.byMethod.length === 0 && <TableEmpty colSpan={3}>Ingen salg med disse filtrene.</TableEmpty>}
              {rev.byMethod.map((m) => (
                <Tr key={m.method}>
                  <Td className="font-medium text-fg">{m.method}</Td>
                  <Td align="right" nums>{nok(m.total)}</Td>
                  <Td align="right" nums muted>
                    {t.total > 0 ? `${Math.round((m.total / t.total) * 100)} %` : "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      {rev.byDay.length > 1 && rev.byDay.length <= 62 && (
        <Card title={`Omsetning per dag (${vatLabel})`}>
          <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Omsetning per dag">
            {rev.byDay.map((d) => (
              <div
                key={d.date}
                className="min-w-[4px] flex-1 rounded-t-sm bg-accent-soft/80 hover:bg-accent-soft"
                style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
                title={`${d.date.split("-").reverse().join(".")}: ${nok(d.total)}`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted tabular-nums">
            <span>{rev.byDay[0].date.split("-").reverse().join(".")}</span>
            <span>Høyeste dag: {nok(maxDay)}</span>
            <span>{rev.byDay[rev.byDay.length - 1].date.split("-").reverse().join(".")}</span>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Rebooking" value={`${k.rebooking.pct} %`} sub="kom tilbake" />
        <StatTile
          label="Anbefaling"
          value={k.referral.withSource > 0 ? `${k.referral.pct} %` : "—"}
          sub="munn-til-munn"
        />
      </div>

      {/* Timeutnyttelse */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Timeutnyttelse</h2>
          <p className="mt-1 text-xs text-muted">
            Booket {k.utilization.bookedHours} t av {k.utilization.capacityHours} t kapasitet ·{" "}
            {k.utilization.activeBarbers} barberer, mot faktisk turnus (uke A/B, fravær trukket fra)
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
            Booket tid mot faktisk turnus (uke A/B, fravær trukket fra). Barbere
            uten turnus regnes mot salongens åpningstid. Samme definisjon som
            Produktivitet-rapporten.
          </p>
        </div>
      </Card>

      {/* Rebooking */}
      <Card padded={false}>
        <div className="p-6">
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
      </Card>

      {/* Anbefaling / kundekilde */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Anbefaling &amp; kundekilde</h2>
          <p className="mt-1 text-xs text-muted">
            Nye kunder i perioden: {k.referral.newCustomers} · oppga kilde: {k.referral.withSource}
          </p>
        </div>
        <div className="p-6">
          {k.referral.withSource === 0 ? (
            <EmptyState
              title="Fylles framover."
              description="Kilde samles inn fra «Hvordan hørte du om oss?» i booking. Tallet blir meningsfullt når nye kunder har svart."
            />
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
      </Card>
    </div>
  );
}
