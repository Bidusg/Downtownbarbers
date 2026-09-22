"use client";

import { useState, useTransition } from "react";
import type { DailyReconRow } from "@/lib/ops-queries";
import { moreReconciliation } from "@/app/admin/kasseoppgjor/actions";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";
const signedKr = (n: number) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("nb-NO") + " kr";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function total(b: { cash: number; card: number; vipps: number }) {
  return b.cash + b.card + b.vipps;
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Dag for dag</h2>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">
            Forventet fra salget · talt fra oppgjøret · avvik = talt − forventet
          </span>
          <a
            href={`/admin/kasseoppgjor/pdf?from=${start}&to=${endDate}`}
            className="border border-line-2 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
          >
            Last ned PDF
          </a>
        </div>
      </div>

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3 text-right">Forventet</th>
              <th className="px-4 py-3 text-right">Talt</th>
              <th className="px-4 py-3 text-right">Avvik</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ingen salg eller oppgjør i perioden.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const exp = total(r.expected);
              const cnt = r.counted ? total(r.counted) : null;
              const methodTitle = `Kontant ${kr(r.expected.cash)} · Kort ${kr(
                r.expected.card,
              )} · Vipps ${kr(r.expected.vipps)}`;
              return (
                <tr key={r.date} className="border-t border-line align-top">
                  <td className="px-4 py-3 font-medium text-fg">
                    {no(r.date)}
                    {r.note && (
                      <span className="block text-xs text-muted">{r.note}</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-muted"
                    title={methodTitle}
                  >
                    {kr(exp)}
                  </td>
                  <td className="px-4 py-3 text-right font-display text-accent-soft">
                    {cnt == null ? "—" : kr(cnt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {cnt == null ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <Avvik diff={cnt - exp} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.settled ? (
                      <span className="text-xs font-semibold text-accent-soft">
                        Avstemt
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Ikke avstemt</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-center">
        {done ? (
          <span className="text-xs text-muted">Ingen eldre dager med aktivitet.</span>
        ) : (
          <button
            onClick={loadOlder}
            disabled={pending}
            className="border border-line-2 px-4 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-50"
          >
            {pending ? "Laster …" : "Vis eldre"}
          </button>
        )}
      </div>
    </div>
  );
}
