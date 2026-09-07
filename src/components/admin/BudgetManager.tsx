"use client";

import { useTransition } from "react";
import type { Budget, StaffOption } from "@/lib/ops-queries";
import { setBudget, deleteBudget } from "@/app/admin/budsjett/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export function BudgetManager({
  budgets,
  staff,
  year,
  month,
}: {
  budgets: Budget[];
  staff: StaffOption[];
  year: number;
  month: number;
}) {
  const [pending, start] = useTransition();
  const byStaff = new Map(budgets.map((b) => [b.staff_id, b]));
  const total = budgets.reduce((s, b) => s + b.target_nok, 0);
  const years = [year - 1, year, year + 1];

  return (
    <div className="space-y-6">
      {/* Måneds-velger */}
      <form method="get" className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
        <label className="text-xs text-muted">
          Måned
          <select name="month" defaultValue={month} className={`mt-1 block ${inputCls}`}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          År
          <select name="year" defaultValue={year} className={`mt-1 block ${inputCls}`}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-surface-2 px-4 py-2 text-sm font-semibold text-fg hover:bg-line"
        >
          Vis
        </button>
        <span className="ml-auto text-sm text-muted">
          Totalt mål: <span className="font-display text-fg">{kr(total)}</span>
        </span>
      </form>

      {staff.length === 0 ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Ingen aktive ansatte enda – legg til ansatte først.
        </div>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Barber</th>
                <th className="px-4 py-3">Mål {MONTHS[month - 1]} {year}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const b = byStaff.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-fg">
                      {s.full_name}
                      <span className="ml-2 text-xs text-muted">
                        {s.title ?? "Barber"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <form action={setBudget} className="flex items-center gap-2">
                        <input type="hidden" name="staff_id" value={s.id} />
                        <input type="hidden" name="year" value={year} />
                        <input type="hidden" name="month" value={month} />
                        <input
                          name="target_nok"
                          type="number"
                          min={0}
                          step="1000"
                          defaultValue={b ? b.target_nok : ""}
                          placeholder="0"
                          className="w-32 border border-line-2 bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent-soft"
                        />
                        <span className="text-xs text-muted">kr</span>
                        <button
                          type="submit"
                          className="bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft hover:bg-accent-soft/25"
                        >
                          Lagre
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b && (
                        <button
                          onClick={() => start(() => deleteBudget(b.id))}
                          disabled={pending}
                          className="text-xs text-danger hover:underline"
                        >
                          Nullstill
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
