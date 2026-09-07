"use client";

import { useState, useTransition } from "react";
import type { StaffHour, StaffOption } from "@/lib/ops-queries";
import {
  createStaffHour,
  deleteStaffHour,
} from "@/app/admin/timelister/actions";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const WEEKDAYS = [
  "Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag",
];

// Mandag først i visningen (DB bruker 0 = søndag).
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function StaffHoursManager({
  hours,
  staff,
}: {
  hours: StaffHour[];
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const byStaff = staff.map((s) => ({
    staff: s,
    rows: hours
      .filter((h) => h.staff_id === s.id)
      .sort((a, b) => ORDER.indexOf(a.weekday) - ORDER.indexOf(b.weekday)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{hours.length} vakter i malen</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Ny vakt"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createStaffHour(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4"
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
          <select name="weekday" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Ukedag …
            </option>
            {ORDER.map((w) => (
              <option key={w} value={w}>
                {WEEKDAYS[w]}
              </option>
            ))}
          </select>
          <label className="text-xs text-muted">
            Fra
            <input name="start_time" type="time" required className={`mt-1 block w-full ${inputCls}`} defaultValue="09:00" />
          </label>
          <label className="text-xs text-muted">
            Til
            <input name="end_time" type="time" required className={`mt-1 block w-full ${inputCls}`} defaultValue="19:00" />
          </label>
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2 lg:col-span-4"
          >
            Legg til vakt
          </button>
        </form>
      )}

      {staff.length === 0 && (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Ingen aktive ansatte enda – legg til ansatte først.
        </div>
      )}

      <div className="space-y-4">
        {byStaff.map(({ staff: s, rows }) => (
          <div key={s.id} className="border border-line bg-surface">
            <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
              <p className="font-medium text-fg">{s.full_name}</p>
              <p className="text-xs text-muted">{s.title ?? "Barber"}</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">
                Ingen fast arbeidstid satt.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between px-5 py-2.5 text-sm"
                  >
                    <span className="w-28 text-fg">{WEEKDAYS[h.weekday]}</span>
                    <span className="font-display text-muted">
                      {h.start_time}–{h.end_time}
                    </span>
                    <button
                      onClick={() => start(() => deleteStaffHour(h.id))}
                      disabled={pending}
                      className="text-xs text-danger hover:underline"
                    >
                      Slett
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
