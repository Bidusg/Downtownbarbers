"use client";

import { useState, useTransition } from "react";
import type { CashSettlement } from "@/lib/ops-queries";
import {
  createSettlement,
  deleteSettlement,
} from "@/app/admin/kasseoppgjor/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function SettlementManager({
  settlements,
  defaultDate,
}: {
  settlements: CashSettlement[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Dagsoppgjør</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Nytt oppgjør"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createSettlement(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-3"
        >
          <label className="text-xs text-muted">
            Dato
            <input name="settle_date" type="date" required defaultValue={defaultDate} className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Sum (kr, inkl. mva)
            <input name="total_nok" type="number" min={0} step="1" required className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <input name="note" placeholder="Notat (valgfritt)" className={`${inputCls} self-end`} />
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-3"
          >
            Lagre oppgjør
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3">Sum</th>
              <th className="px-4 py-3">Notat</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Ingen oppgjør registrert enda.
                </td>
              </tr>
            )}
            {settlements.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">{no(s.settle_date)}</td>
                <td className="px-4 py-3 font-display text-accent-soft">{kr(s.total_nok)}</td>
                <td className="px-4 py-3 text-muted">{s.note ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      if (confirm("Slette dette oppgjøret?"))
                        start(() => deleteSettlement(s.id));
                    }}
                    disabled={pending}
                    className="text-xs text-danger hover:underline"
                  >
                    Slett
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
