"use client";

import { useState, useTransition } from "react";
import type { DailyReconRow } from "@/lib/ops-queries";
import { moreReconciliation } from "@/app/admin/kasseoppgjor/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";
const signedKr = (n: number) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("nb-NO") + " kr";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];

/** Siste 12 måneder (inkl. denne) som {value: "yyyy-mm", label}. */
function lastMonths(endDate: string, n = 12) {
  const [y0, m0] = endDate.split("-").map(Number);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    out.push({
      value: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTHS[m][0].toUpperCase()}${MONTHS[m].slice(1)} ${y}`,
    });
  }
  return out;
}

/** «2026-10» → første og siste dato i måneden. */
function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

/** −1 dag på en yyyy-mm-dd (UTC), som streng. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Avvik({ diff }: { diff: number }) {
  if (diff === 0)
    return <span className="text-xs font-semibold text-accent-soft">✓ stemmer</span>;
  return (
    <span className="text-xs font-semibold text-danger" title="Talt minus forventet">
      {signedKr(diff)} {diff > 0 ? "(overskudd)" : "(manko)"}
    </span>
  );
}

/**
 * Dag-for-dag-visning av kasseoppgjøret: bla bakover og se forventet salg,
 * talt beløp og avvik per dag. Dager uten oppgjør vises som «ikke avstemt»
 * (forventet fra salget). «Vis eldre» henter 30 dager til om gangen.
 */
export function DailyReconciliation({
  initialRows,
  windowStart,
  endDate,
  windowDays = 30,
}: {
  initialRows: DailyReconRow[];
  /** Eldste dato i det først innlastede vinduet (yyyy-mm-dd). */
  windowStart: string;
  /** Nyeste dato i visningen (i dag, yyyy-mm-dd) – brukt til PDF-perioden. */
  endDate: string;
  windowDays?: number;
}) {
  const [rows, setRows] = useState<DailyReconRow[]>(initialRows);
  const [start, setStart] = useState(windowStart);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const months = lastMonths(endDate);
  // Standard: forrige måned (den som skal avstemmes mot regnskapet).
  const [period, setPeriod] = useState<string>(months[1]?.value ?? months[0].value);
  const [customFrom, setCustomFrom] = useState(windowStart);
  const [customTo, setCustomTo] = useState(endDate);
  const range =
    period === "custom" ? { from: customFrom, to: customTo } : monthRange(period);
  const pdfHref = `/admin/kasseoppgjor/pdf?from=${range.from}&to=${range.to}`;

  function loadOlder() {
    startTransition(async () => {
      const end = dayBefore(start);
      const older = await moreReconciliation(end, windowDays);
      // Nytt vindu-start (eldste dato vi nå har spurt om).
      const nextStart = new Date(`${end}T00:00:00.000Z`);
      nextStart.setUTCDate(nextStart.getUTCDate() - (windowDays - 1));
      setStart(nextStart.toISOString().slice(0, 10));
      if (older.length === 0) {
        setDone(true);
        return;
      }
      setRows((cur) => [...cur, ...older]);
    });
  }

  return (
    <div>
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Rapport for periode</h2>
            <p className="text-xs text-muted">
              Kasseoppgjør dag for dag som PDF – totalsalg, kontant, kort, Vipps og gavekort.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted">
              <span className="mb-1 block">Periode</span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-10 border border-line-2 bg-surface px-3 text-sm text-fg"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                <option value="custom">Velg datoer …</option>
              </select>
            </label>
            {period === "custom" && (
              <>
                <label className="text-xs text-muted">
                  <span className="mb-1 block">Fra</span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-10 border border-line-2 bg-surface px-2 text-sm text-fg"
                  />
                </label>
                <label className="text-xs text-muted">
                  <span className="mb-1 block">Til</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={endDate}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-10 border border-line-2 bg-surface px-2 text-sm text-fg"
                  />
                </label>
              </>
            )}
            <a
              href={pdfHref}
              className="inline-flex h-10 items-center bg-accent px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Last ned PDF
            </a>
          </div>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Dag for dag</h2>
        <span className="hidden text-xs text-muted sm:inline">
          Kort og Vipps føres automatisk (kan overstyres av admin) · bare kontant telles · avvik = talt − forventet kontant
        </span>
      </div>

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head className="bg-surface-2 tracking-wide uppercase">
              <Th>Dato</Th>
              <Th align="right">Totalt salg</Th>
              <Th align="right">Kort + Vipps</Th>
              <Th align="right">Kontant forventet</Th>
              <Th align="right">Kontant talt</Th>
              <Th align="right">Avvik</Th>
              <Th>Status</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={7}>
                Ingen salg eller oppgjør i perioden.
              </TableEmpty>
            )}
            {rows.map((r) => {
              const cashCounted = r.counted ? r.counted.cash : null;
              const extra =
                (r.gift ? ` · Gavekort ${kr(r.gift)}` : "") +
                (r.other ? ` · Annet ${kr(r.other)}` : "");
              return (
                <Tr key={r.date} className="align-top">
                  <Td className="font-medium text-fg">
                    {no(r.date)}
                    {r.note && (
                      <span className="block text-xs text-muted">{r.note}</span>
                    )}
                  </Td>
                  <Td
                    align="right"
                    nums
                    className="text-fg"
                    title={`${r.salesCount} salg${extra}`}
                  >
                    {kr(r.salesTotal)}
                    {(r.gift > 0 || r.other > 0) && (
                      <span className="block text-[11px] text-muted">{extra.slice(3)}</span>
                    )}
                  </Td>
                  {(() => {
                    // Oppgjøret (evt. overstyrt av admin) vinner over kassens tall.
                    const card = r.counted ? r.counted.card : r.expected.card;
                    const vipps = r.counted ? r.counted.vipps : r.expected.vipps;
                    const overridden =
                      !!r.counted &&
                      (r.counted.card !== r.expected.card || r.counted.vipps !== r.expected.vipps);
                    return (
                      <Td
                        align="right"
                        muted={!overridden}
                        nums
                        className={overridden ? "text-fg" : undefined}
                        title={
                          `Kort ${kr(card)} · Vipps ${kr(vipps)}` +
                          (overridden
                            ? ` (fra kassen: kort ${kr(r.expected.card)} · Vipps ${kr(r.expected.vipps)})`
                            : "")
                        }
                      >
                        {kr(card + vipps)}
                        {overridden && (
                          <span className="block text-[11px] text-muted">overstyrt</span>
                        )}
                      </Td>
                    );
                  })()}
                  <Td align="right" muted nums>
                    {kr(r.expected.cash)}
                  </Td>
                  <Td align="right" nums className="font-display text-accent-soft">
                    {cashCounted == null ? "—" : kr(cashCounted)}
                  </Td>
                  <Td align="right">
                    {cashCounted == null ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <Avvik diff={cashCounted - r.expected.cash} />
                    )}
                  </Td>
                  <Td>
                    {r.settled ? (
                      <Badge tone="success">Avstemt</Badge>
                    ) : (
                      <Badge tone="neutral">Ikke avstemt</Badge>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <div className="mt-3 flex items-center justify-center">
        {done ? (
          <span className="text-xs text-muted">Ingen eldre dager med aktivitet.</span>
        ) : (
          <Button
            variant="subtle"
            onClick={loadOlder}
            disabled={pending}
            className="px-4 py-2 text-sm"
          >
            {pending ? "Laster …" : "Vis eldre"}
          </Button>
        )}
      </div>
    </div>
  );
}
