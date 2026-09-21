"use client";

import { useState, useTransition } from "react";
import type { StaffHour, StaffOption } from "@/lib/ops-queries";
import {
  createStaffHour,
  deleteStaffHour,
  updateStaffHour,
  copyTurnusWeek,
} from "@/app/admin/timelister/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { parityLabel, parityOptions } from "@/lib/turnus";

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
  weeks = 2,
}: {
  hours: StaffHour[];
  staff: StaffOption[];
  weeks?: number;
}) {
  const indices = parityOptions(weeks); // [1..weeks]
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byStaff = staff.map((s) => ({
    staff: s,
    rows: hours
      .filter((h) => h.staff_id === s.id)
      .sort((a, b) => ORDER.indexOf(a.weekday) - ORDER.indexOf(b.weekday)),
  }));

  function copy(from: number, to: number) {
    const fromL = from === 1 ? "A" : "B";
    const toL = to === 1 ? "A" : "B";
    if (
      !confirm(
        `Kopiere uke ${fromL} til uke ${toL}? Dette erstatter alle uke ${toL}-vaktene med en kopi av uke ${fromL}.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("from", String(from));
    fd.set("to", String(to));
    start(() => copyTurnusWeek(fd));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{hours.length} vakter i malen</p>
        <div className="flex flex-wrap items-center gap-2">
          {weeks === 2 && (
            <>
              <button
                onClick={() => copy(1, 2)}
                disabled={pending}
                className="border border-line-2 px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-40"
              >
                Kopier A → B
              </button>
              <button
                onClick={() => copy(2, 1)}
                disabled={pending}
                className="border border-line-2 px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-40"
              >
                Kopier B → A
              </button>
            </>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
          >
            {open ? "Lukk" : "+ Ny vakt"}
          </button>
        </div>
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
          <select name="week_parity" className={inputCls} defaultValue="0">
            <option value="0">Hver uke</option>
            {weeks > 1 &&
              indices.map((i) => (
                <option key={i} value={i}>
                  {parityLabel(i)}
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
                {rows.map((h) =>
                  editId === h.id ? (
                    <li key={h.id} className="px-5 py-3">
                      <form
                        action={async (fd) => {
                          await updateStaffHour(fd);
                          setEditId(null);
                        }}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <input type="hidden" name="id" value={h.id} />
                        <span className="w-28 text-fg">{WEEKDAYS[h.weekday]}</span>
                        <input
                          name="start_time"
                          type="time"
                          required
                          defaultValue={h.start_time}
                          className={`${inputCls} w-28`}
                        />
                        <span className="text-muted">–</span>
                        <input
                          name="end_time"
                          type="time"
                          required
                          defaultValue={h.end_time}
                          className={`${inputCls} w-28`}
                        />
                        <select
                          name="week_parity"
                          defaultValue={String(h.week_parity)}
                          className={`${inputCls} w-28`}
                        >
                          <option value="0">Hver uke</option>
                          {weeks > 1 &&
                            indices.map((i) => (
                              <option key={i} value={i}>
                                {parityLabel(i)}
                              </option>
                            ))}
                        </select>
                        <button
                          type="submit"
                          disabled={pending}
                          className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                        >
                          Lagre
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 text-xs text-muted hover:text-fg"
                        >
                          Avbryt
                        </button>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={h.id}
                      className="flex items-center justify-between px-5 py-2.5 text-sm"
                    >
                      <span className="w-28 text-fg">{WEEKDAYS[h.weekday]}</span>
                      <span className="font-display text-muted">
                        {h.start_time}–{h.end_time}
                      </span>
                      <span
                        className={
                          "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                          (h.week_parity === 0
                            ? "bg-surface-2 text-muted"
                            : "bg-accent-soft/15 text-accent-soft")
                        }
                      >
                        {parityLabel(h.week_parity)}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditId(h.id)}
                          className="text-xs text-muted hover:text-fg hover:underline"
                        >
                          Endre
                        </button>
                        <ConfirmButton
                          label="Slett"
                          confirmLabel="Ja, slett"
                          pendingLabel="Sletter …"
                          disabled={pending}
                          onConfirm={() => deleteStaffHour(h.id)}
                        />
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
