"use client";

import { useState, useTransition } from "react";
import type { Absence, StaffOption } from "@/lib/ops-queries";
import { createAbsence, deleteAbsence } from "@/app/admin/fravaer/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

function no(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function AbsenceManager({
  absences,
  staff,
}: {
  absences: Absence[];
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{absences.length} registrerte fravær</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Nytt fravær"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createAbsence(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <select name="staff_id" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Velg ansatt …
            </option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <input name="reason" placeholder="Årsak (valgfritt)" className={inputCls} />
          <label className="text-xs text-muted">
            Fra dato
            <input name="from_date" type="date" required className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Til dato
            <input name="to_date" type="date" required className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2"
          >
            Lagre fravær
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Ansatt</th>
              <th className="px-4 py-3">Fra</th>
              <th className="px-4 py-3">Til</th>
              <th className="px-4 py-3">Årsak</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {absences.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ingen fravær registrert enda.
                </td>
              </tr>
            )}
            {absences.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">{a.staffName}</td>
                <td className="px-4 py-3 text-muted">{no(a.from_date)}</td>
                <td className="px-4 py-3 text-muted">{no(a.to_date)}</td>
                <td className="px-4 py-3 text-muted">{a.reason ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => start(() => deleteAbsence(a.id))}
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
