"use client";

import { useTransition } from "react";
import type { HistRow } from "@/lib/historical-revenue";
import { deleteHistoryRow } from "@/app/admin/historikk/actions";

const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const kr = (n: number) => Math.round(n).toLocaleString("nb-NO");

/** Oversikt over importerte tall: én rad per ansatt, kolonner per måned. */
export function HistoryTable({ rows }: { rows: HistRow[] }) {
  const [pending, start] = useTransition();
  if (rows.length === 0)
    return <p className="text-sm text-muted">Ingen historiske tall importert ennå.</p>;

  const months = Array.from(new Set(rows.map((r) => r.month))).sort();
  const byStaff = new Map<string, { name: string; cells: Map<string, HistRow> }>();
  for (const r of rows) {
    const e = byStaff.get(r.staffId) ?? { name: r.staffName, cells: new Map() };
    e.cells.set(r.month, r);
    byStaff.set(r.staffId, e);
  }
  const monthSum = (m: string) => rows.filter((r) => r.month === m).reduce((s, r) => s + r.totalNok, 0);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-display text-lg font-bold">Importert</h2>
        <p className="text-xs text-muted">Sum inkl. mva per måned. Trykk × for å slette en måned.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="sticky left-0 bg-surface px-4 py-2 text-left font-medium">Ansatt</th>
              {months.map((m) => {
                const [y, mm] = m.split("-").map(Number);
                return (
                  <th key={m} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {MND[mm - 1]} {String(y).slice(2)}
                  </th>
                );
              })}
              <th className="px-4 py-2 text-right font-medium">Sum</th>
            </tr>
          </thead>
          <tbody className={pending ? "opacity-60" : ""}>
            {Array.from(byStaff, ([id, e]) => {
              const sum = Array.from(e.cells.values()).reduce((s, r) => s + r.totalNok, 0);
              return (
                <tr key={id} className="border-b border-line/60">
                  <td className="sticky left-0 bg-surface px-4 py-1.5 font-medium whitespace-nowrap text-fg">{e.name}</td>
                  {months.map((m) => {
                    const c = e.cells.get(m);
                    return (
                      <td key={m} className="group px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-muted">
                        {c ? (
                          <>
                            <span title={`${c.visits} besøk · ${c.hours.toLocaleString("nb-NO")} t · ${c.source ?? ""}`}>
                              {kr(c.totalNok)}
                            </span>
                            <button
                              type="button"
                              onClick={() => start(() => deleteHistoryRow(c.id))}
                              className="ml-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger [@media(pointer:coarse)]:opacity-100"
                              aria-label="Slett måned"
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-1.5 text-right font-semibold tabular-nums text-fg">{kr(sum)}</td>
                </tr>
              );
            })}
            <tr>
              <td className="sticky left-0 bg-surface px-4 py-2 text-xs font-semibold text-muted uppercase">Totalt</td>
              {months.map((m) => (
                <td key={m} className="px-2 py-2 text-right font-semibold tabular-nums text-fg">{kr(monthSum(m))}</td>
              ))}
              <td className="px-4 py-2 text-right font-display font-bold tabular-nums text-fg">
                {kr(rows.reduce((s, r) => s + r.totalNok, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
