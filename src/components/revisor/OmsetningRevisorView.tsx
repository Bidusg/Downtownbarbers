import Link from "next/link";
import { StatTile } from "@/components/ui/StatTile";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import {
  getSalesForPeriod,
  getDaysInMonth,
  getPeriodReport,
} from "@/lib/dashboard-queries";
import {
  osloMonthRange,
  osloDayRange,
  resolvePeriod,
  quarterStep,
} from "@/lib/period";
import { PAYROLL } from "@/lib/ops-queries";
import { formatKr as nok, methodLabel, formatDate } from "@/lib/format";

const MND = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

const BASE = "/revisor/omsetning";

/** Felles «Per barber + per betalingsmåte»-seksjon (samme stil som rapporten). */
function BarberMethod({
  byBarber,
  byMethod,
}: {
  byBarber: { name: string; nok: number }[];
  byMethod: { method: string; nok: number }[];
}) {
  const maxB = Math.max(1, ...byBarber.map((b) => b.nok));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <h2 className="mb-5 font-display text-lg font-bold">Per barber</h2>
        {byBarber.length === 0 ? (
          <EmptyState description="Ingen salg i perioden." />
        ) : (
          <div className="space-y-4">
            {byBarber.map((b) => (
              <div key={b.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-fg">{b.name}</span>
                  <span className="font-medium tabular-nums">{nok(b.nok)}</span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-accent-soft"
                    style={{ width: `${Math.round((b.nok / maxB) * 100)}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-5 font-display text-lg font-bold">Per betalingsmåte</h2>
        {byMethod.length === 0 ? (
          <EmptyState description="Ingen salg med betalingsmåte i perioden." />
        ) : (
          <ul className="space-y-2 text-sm">
            {byMethod.map((m) => (
              <li key={m.method} className="flex justify-between border-b border-line pb-2 last:border-0">
                <span className="text-fg-soft">{methodLabel(m.method)}</span>
                <span className="font-medium tabular-nums">{nok(m.nok)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Periodevelger: Måned | Kvartal (beholder valgt periode i lenkene). */
function PeriodeTabs({ active, mnd, ar, kv }: { active: "maaned" | "kvartal"; mnd: string; ar: number; kv: number }) {
  const tab = (key: "maaned" | "kvartal", href: string, label: string) => (
    <Link
      href={href}
      className={
        "border-b-2 px-3 py-2 text-sm transition-colors " +
        (active === key
          ? "border-accent-soft font-semibold text-fg"
          : "border-transparent text-muted hover:text-fg")
      }
    >
      {label}
    </Link>
  );
  return (
    <Card padded={false}>
      <div className="flex items-center gap-1 px-4">
        {tab("maaned", `${BASE}?periode=maaned&mnd=${mnd}`, "Måned")}
        {tab("kvartal", `${BASE}?periode=kvartal&ar=${ar}&kv=${kv}`, "Kvartal")}
      </div>
    </Card>
  );
}

/** ← overskrift → navigasjon for forrige/neste periode. */
function PeriodNav({ title, prevHref, nextHref }: { title: string; prevHref: string; nextHref: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={prevHref}
        className="border border-line px-2 py-1 text-sm text-muted hover:text-fg"
        aria-label="Forrige periode"
      >
        ←
      </Link>
      <h1 className="font-display text-2xl font-bold capitalize">Omsetning {title}</h1>
      <Link
        href={nextHref}
        className="border border-line px-2 py-1 text-sm text-muted hover:text-fg"
        aria-label="Neste periode"
      >
        →
      </Link>
    </div>
  );
}

/**
 * Revisor-variant av omsetningsvisningen: periodevelger (Måned/Kvartal) med
 * server-side navigasjon via searchParams, ← → for forrige/neste periode og
 * drill-down fra måned → dag. Gjenbruker eksisterende spørringer
 * (getSalesForPeriod, getDaysInMonth, getPeriodReport) – ingen nye tall.
 *
 * Delt visning (OmsetningView) og admin-bruken er bevisst ikke rørt.
 */
export async function OmsetningRevisorView({
  periode,
  mnd,
  dag,
  ar,
  kv,
}: {
  periode?: string;
  mnd?: string;
  dag?: string;
  ar?: string;
  kv?: string;
}) {
  const back = (
    <Link href="/revisor" className="text-sm text-muted underline-offset-2 hover:text-fg hover:underline">
      ← Tilbake til oversikt
    </Link>
  );

  /* ---------- DAGSVISNING (drill-down fra måned) ---------- */
  const dayRange = dag ? osloDayRange(dag) : null;
  if (dayRange) {
    const { rows, total, byBarber, byMethod } = await getSalesForPeriod(dayRange.fromIso, dayRange.toIso);
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.nok, 0) / rows.length) : 0;
    const title = new Date(dayRange.key + "T12:00:00Z").toLocaleDateString("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-1">
          {back}
          <h1 className="font-display text-2xl font-bold capitalize">Omsetning {title}</h1>
          <Link
            href={`${BASE}?periode=maaned&mnd=${dayRange.monthKey}`}
            className="text-sm font-medium text-accent-soft underline underline-offset-2 hover:text-fg"
          >
            ← Se hele måneden
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Omsetning" value={nok(total)} sub="denne dagen" />
          <StatTile label="Antall salg" value={rows.length.toLocaleString("nb-NO")} />
          <StatTile label="Snitt per salg" value={nok(avg)} />
        </div>

        <Card padded={false}>
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Salg denne dagen</h2>
          </div>
          <Table>
            <THead>
              <Tr head>
                <Th>Tid</Th>
                <Th>Barber</Th>
                <Th>Kunde</Th>
                <Th>Betaling</Th>
                <Th align="right">Beløp</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={5}>Ingen registrerte salg.</TableEmpty>
              ) : (
                rows.map((r) => (
                  <Tr key={r.id}>
                    <Td nums>{r.time}</Td>
                    <Td>{r.barber}</Td>
                    <Td className="text-fg-soft">{r.customer}</Td>
                    <Td className="text-fg-soft">{methodLabel(r.method)}</Td>
                    <Td align="right" nums className="font-medium">{nok(r.nok)}</Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </Card>

        <BarberMethod byBarber={byBarber} byMethod={byMethod} />
      </div>
    );
  }

  /* ---------- KVARTALSVISNING ---------- */
  if (periode === "kvartal") {
    const p = resolvePeriod({ type: "kvartal", ar, kv });
    const rep = await getPeriodReport(p.fromIso, p.toIso);
    const inkl = rep.total;
    const eks = Math.round(inkl / (1 + PAYROLL.MVA));
    const mva = inkl - eks;
    const snitt = rep.count ? Math.round((inkl - rep.fixitNok) / rep.count) : 0;
    const monthMap = new Map(rep.byMonth.map((m) => [m.key, m]));
    const maxMonth = Math.max(1, ...p.months.map((m) => monthMap.get(m.key)?.nok ?? 0));
    const prev = quarterStep(p.year, p.index, -1);
    const next = quarterStep(p.year, p.index, 1);

    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3">
          {back}
          <PeriodeTabs active="kvartal" mnd={osloMonthRange().key} ar={p.year} kv={p.index} />
          <PeriodNav
            title={p.label}
            prevHref={`${BASE}?periode=kvartal&ar=${prev.year}&kv=${prev.q}`}
            nextHref={`${BASE}?periode=kvartal&ar=${next.year}&kv=${next.q}`}
          />
          <p className="text-sm text-muted">
            {formatDate(p.fromDate)} – {formatDate(p.toDate)} · beløp inkl. mva der ikke annet er angitt.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Omsetning inkl. mva"
            value={nok(inkl)}
            sub={rep.fixitNok > 0 ? `${p.label} · inkl. Fixit-historikk` : p.label}
          />
          <StatTile label="Omsetning eks. mva" value={nok(eks)} sub={`${Math.round(PAYROLL.MVA * 100)} % mva`} />
          <StatTile label="Utgående mva" value={nok(mva)} sub="beregnet, standard sats" />
          <StatTile
            label="Antall salg"
            value={rep.count.toLocaleString("nb-NO")}
            sub={rep.fixitNok > 0 ? "kun salgslinjer (ikke Fixit-dagstotaler)" : undefined}
          />
          <StatTile
            label="Snitt per salg"
            value={nok(snitt)}
            sub={rep.fixitNok > 0 ? "av salgslinjene" : undefined}
          />
          <StatTile label="Antall barbere" value={String(rep.byBarber.length)} sub="med salg i perioden" />
        </div>

        <Card padded={false}>
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-display text-lg font-bold">Omsetning per måned</h2>
          </div>
          <ul>
            {p.months.map((m) => {
              const v = monthMap.get(m.key);
              const val = v?.nok ?? 0;
              const [y, mm] = m.key.split("-").map(Number);
              return (
                <li key={m.key} className="border-b border-line last:border-0">
                  <Link
                    href={`${BASE}?periode=maaned&mnd=${m.key}`}
                    className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="w-28 text-sm capitalize text-fg-soft">{MND[mm - 1]} {y}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full rounded-full bg-accent-soft"
                        style={{ width: `${Math.round((val / maxMonth) * 100)}%` }}
                      />
                    </span>
                    <span className="w-16 text-right text-xs text-muted tabular-nums">
                      {(v?.count ?? 0).toLocaleString("nb-NO")} salg
                    </span>
                    <span className="w-28 text-right text-sm font-medium tabular-nums">{nok(val)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        {rep.fixitNok > 0 && (
          <p className="text-xs text-muted">
            Omsetningen inkluderer Fixit-historikk ({nok(rep.fixitNok)}) for dager til og med
            3. oktober 2026 – Fixit-eksporten har kun dagstotaler, så «Per barber», «Per
            betalingsmåte» og antall salg dekker bare dager med salgslinjer.
          </p>
        )}

        <BarberMethod byBarber={rep.byBarber} byMethod={rep.byMethod} />

        <p className="text-xs text-muted">
          Trenger du halvår eller helår? Se{" "}
          <Link href="/revisor/rapport" className="font-medium text-accent-soft underline underline-offset-2 hover:text-fg">
            Perioderapport
          </Link>.
        </p>
      </div>
    );
  }

  /* ---------- MÅNEDSVISNING (default) ---------- */
  const month = osloMonthRange(mnd);
  const [my, mm] = month.key.split("-").map(Number);
  const [{ total, rows, byBarber, byMethod }, days] = await Promise.all([
    getSalesForPeriod(month.fromIso, month.toIso),
    getDaysInMonth(month.key),
  ]);
  const maxDay = Math.max(1, ...days.map((dd) => dd.nok));
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.nok, 0) / rows.length) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-3">
        {back}
        <PeriodeTabs active="maaned" mnd={month.key} ar={my} kv={Math.floor((mm - 1) / 3) + 1} />
        <PeriodNav
          title={`${MND[mm - 1]} ${my}`}
          prevHref={`${BASE}?periode=maaned&mnd=${month.prev}`}
          nextHref={`${BASE}?periode=maaned&mnd=${month.next}`}
        />
        <p className="text-sm text-muted">Klikk en dag for å se enkeltsalgene.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Omsetning" value={nok(total)} sub="hele måneden" />
        <StatTile label="Antall salg" value={rows.length.toLocaleString("nb-NO")} />
        <StatTile label="Snitt per salg" value={nok(avg)} />
      </div>

      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Omsetning per dag</h2>
        </div>
        {days.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen salg denne måneden.</p>
        ) : (
          <ul>
            {days.map((dd) => (
              <li key={dd.key} className="border-b border-line last:border-0">
                <Link
                  href={`${BASE}?periode=maaned&dag=${dd.key}`}
                  className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="w-14 text-sm text-fg-soft tabular-nums">{dd.label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full bg-accent-soft"
                      style={{ width: `${Math.round((dd.nok / maxDay) * 100)}%` }}
                    />
                  </span>
                  <span className="w-28 text-right text-sm font-medium tabular-nums">{nok(dd.nok)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <BarberMethod byBarber={byBarber} byMethod={byMethod} />
    </div>
  );
}
