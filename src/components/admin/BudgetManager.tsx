"use client";

import { useState, useTransition } from "react";
import type { Budget, StaffOption } from "@/lib/ops-queries";
import { setBudget, deleteBudget } from "@/app/admin/budsjett/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

/** Ett budsjett-felt med pending og «Lagret ✓»/feil per rad. */
function BudgetForm({
  staffId,
  year,
  month,
  target,
}: {
  staffId: string;
  year: number;
  month: number;
  target: number | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <form
        action={(fd) =>
          start(async () => {
            setMsg(null);
            const res = await setBudget(fd);
            setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Lagret ✓" });
          })
        }
        className="flex items-center gap-2"
      >
        <input type="hidden" name="staff_id" value={staffId} />
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <input
          name="target_nok"
          type="number"
          min={0}
          step="1000"
          defaultValue={target ?? ""}
          placeholder="0"
          onChange={() => setMsg(null)}
          className="w-32 border border-line-2 bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent-soft"
        />
        <span className="text-xs text-muted">kr</span>
        <button type="submit" disabled={pending} className="act act-accent">
          {pending ? "Lagrer …" : "Lagre"}
        </button>
        {msg && (
          <span className={"text-xs " + (msg.ok ? "text-accent-soft" : "text-danger")}>
            {msg.text}
          </span>
        )}
      </form>
    </div>
  );
}

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
  const [pending] = useTransition();
  const byStaff = new Map(budgets.map((b) => [b.staff_id, b]));
  const total = budgets.reduce((s, b) => s + b.target_nok, 0);
  const years = [year - 1, year, year + 1];

  return (
    <div className="space-y-6">
      {/* Måneds-velger */}
      <form method="get" className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
        <label className="text-xs text-muted">
          Måned
          <Select name="month" defaultValue={month} className="mt-1 block">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs text-muted">
          År
          <Select name="year" defaultValue={year} className="mt-1 block">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="subtle" className="px-4 py-2 text-sm">
          Vis
        </Button>
        <span className="ml-auto text-sm text-muted">
          Totalt mål: <span className="font-display text-fg">{kr(total)}</span>
        </span>
      </form>

      {staff.length === 0 ? (
        <EmptyState description="Ingen aktive ansatte enda – legg til ansatte først." />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <Tr head className="bg-surface-2 tracking-wide uppercase">
                <Th>Barber</Th>
                <Th>Mål {MONTHS[month - 1]} {year}</Th>
                <Th></Th>
              </Tr>
            </THead>
            <TBody>
              {staff.map((s) => {
                const b = byStaff.get(s.id);
                return (
                  <Tr key={s.id}>
                    <Td className="font-medium text-fg">
                      {s.full_name}
                      <span className="ml-2 text-xs text-muted">
                        {s.title ?? "Barber"}
                      </span>
                    </Td>
                    <Td>
                      <BudgetForm
                        key={`${s.id}-${year}-${month}`}
                        staffId={s.id}
                        year={year}
                        month={month}
                        target={b ? b.target_nok : null}
                      />
                    </Td>
                    <Td align="right">
                      {b && (
                        <ConfirmButton
                          label="Nullstill"
                          question="Nullstille budsjettet?"
                          confirmLabel="Ja, nullstill"
                          pendingLabel="Nullstiller …"
                          disabled={pending}
                          onConfirm={() => deleteBudget(b.id)}
                        />
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
