"use client";

import { useState, useTransition } from "react";
import type { AdminStaff } from "@/lib/admin-queries";
import { createStaff, toggleStaff } from "@/app/admin/ansatte/actions";

export function StaffManager({ staff }: { staff: AdminStaff[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{staff.length} ansatte</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Ny ansatt"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createStaff(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <input name="employee_number" placeholder="Ansattnr (f.eks. DB-007)" required className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="full_name" placeholder="Fullt navn" required className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="title" placeholder="Tittel (Barber / Master / Lærling)" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="bio" placeholder="Kort bio" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <label className="text-xs text-muted">
            Bilde
            <input name="photo" type="file" accept="image/*" className="mt-1 block w-full text-xs" />
          </label>
          <label className="text-xs text-muted">
            Kontrakt (PDF)
            <input name="contract" type="file" accept="application/pdf" className="mt-1 block w-full text-xs" />
          </label>
          <button type="submit" className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2">
            Lagre ansatt
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Ansatt</th>
              <th className="px-4 py-3">Ansattnr</th>
              <th className="px-4 py-3">Tittel</th>
              <th className="px-4 py-3">Kontrakt</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ingen ansatte enda – koble til Supabase eller legg til den første.
                </td>
              </tr>
            )}
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center bg-surface-2 font-display text-sm font-bold text-fg">
                      {s.full_name.charAt(0)}
                    </span>
                    <span className="font-medium text-fg">{s.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{s.employee_number ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{s.title ?? "—"}</td>
                <td className="px-4 py-3">
                  {s.contract_url ? (
                    <a href={s.contract_url} target="_blank" className="text-xs text-accent-soft hover:underline">
                      Åpne
                    </a>
                  ) : (
                    <span className="text-xs text-muted">Mangler</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => start(() => toggleStaff(s.id, !s.active))}
                    disabled={pending}
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                      (s.active ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")
                    }
                  >
                    {s.active ? "Aktiv" : "Inaktiv"}
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
