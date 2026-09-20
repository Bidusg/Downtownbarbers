"use client";

import { useState, useTransition } from "react";
import type { StaffException, StaffOption } from "@/lib/ops-queries";
import {
  createStaffException,
  deleteStaffException,
} from "@/app/admin/timelister/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

type Mode = "off_full" | "off_part" | "extra";

// Pen dato: "man. 21. sep."
function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function StaffExceptionsManager({
  exceptions,
  staff,
}: {
  exceptions: StaffException[];
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("off_full");
  const [pending] = useTransition();

  const needsTimes = mode !== "off_full";
  const nameOf = (id: string) =>
    staff.find((s) => s.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {exceptions.length} kommende avvik
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Nytt avvik"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            // Oversett UI-modus til feltene actionen forventer.
            fd.set("kind", mode === "extra" ? "extra" : "off");
            if (mode === "off_full") {
              fd.delete("start_time");
              fd.delete("end_time");
            }
            await createStaffException(fd);
            setOpen(false);
            setMode("off_full");
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3"
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

          <input name="date" type="date" required className={inputCls} />

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className={inputCls}
          >
            <option value="off_full">Fri hele dagen</option>
            <option value="off_part">Fri deler av dagen</option>
            <option value="extra">Ekstravakt</option>
          </select>

          {needsTimes && (
            <>
              <label className="text-xs text-muted">
                Fra
                <input
                  name="start_time"
                  type="time"
                  required
                  className={`mt-1 block w-full ${inputCls}`}
                  defaultValue={mode === "extra" ? "09:00" : "12:00"}
                />
              </label>
              <label className="text-xs text-muted">
                Til
                <input
                  name="end_time"
                  type="time"
                  required
                  className={`mt-1 block w-full ${inputCls}`}
                  defaultValue={mode === "extra" ? "17:00" : "13:00"}
                />
              </label>
            </>
          )}

          <input
            name="note"
            placeholder="Notat (valgfritt) – f.eks. ferie, sykdom"
            className={`${inputCls} sm:col-span-2 lg:col-span-3`}
          />

          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2 lg:col-span-3"
          >
            Lagre avvik
          </button>
        </form>
      )}

      {exceptions.length === 0 ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Ingen kommende avvik. Turnusen gjelder som normalt.
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {exceptions.map((e) => {
            const isExtra = e.kind === "extra";
            const isFullOff = e.kind === "off" && !e.start_time;
            const label = isExtra
              ? "Ekstravakt"
              : isFullOff
                ? "Fri hele dagen"
                : "Fri";
            const time =
              e.start_time && e.end_time
                ? `${e.start_time}–${e.end_time}`
                : null;
            return (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"
              >
                <span className="w-28 font-display text-fg">
                  {fmtDate(e.date)}
                </span>
                <span className="min-w-32 flex-1 text-fg">{nameOf(e.staff_id)}</span>
                <span
                  className={
                    "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                    (isExtra
                      ? "bg-accent-soft/15 text-accent-soft"
                      : "bg-danger/10 text-danger")
                  }
                >
                  {label}
                </span>
                <span className="w-24 text-right font-display text-muted">
                  {time ?? "—"}
                </span>
                {e.note && (
                  <span className="w-full text-xs text-muted sm:w-auto sm:flex-1">
                    {e.note}
                  </span>
                )}
                <ConfirmButton
                  label="Slett"
                  confirmLabel="Ja, slett"
                  pendingLabel="Sletter …"
                  disabled={pending}
                  onConfirm={() => deleteStaffException(e.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
