"use client";

import { useState, useTransition } from "react";
import type { BookingBlock } from "@/lib/ops-queries";
import {
  createBookingBlock,
  deleteBookingBlock,
} from "@/app/admin/timelister/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function BookingBlocksManager({ blocks }: { blocks: BookingBlock[] }) {
  const [open, setOpen] = useState(false);
  const [wholeDay, setWholeDay] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();
  const [delPending, startDel] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {blocks.length} kommende blokkering{blocks.length === 1 ? "" : "er"}
        </p>
        <button
          onClick={() => {
            setOpen((o) => !o);
            setMsg(null);
          }}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Ny blokkering"}
        </button>
      </div>

      {open && (
        <form
          action={(fd) =>
            start(async () => {
              setMsg(null);
              setErr(false);
              const r = await createBookingBlock(fd);
              if (r.error) {
                setErr(true);
                setMsg(r.error);
              } else {
                setMsg("Blokkering lagret ✓");
                setOpen(false);
              }
            })
          }
          className="space-y-3 border border-line bg-surface p-4"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Dato
              <input type="date" name="block_date" required className={inputCls} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                name="whole_day"
                checked={wholeDay}
                onChange={(e) => setWholeDay(e.target.checked)}
                className="accent-accent"
              />
              Hele dagen
            </label>
            {!wholeDay && (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Fra
                  <input type="time" name="start_time" defaultValue="12:00" className={inputCls} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Til
                  <input type="time" name="end_time" defaultValue="16:00" className={inputCls} />
                </label>
              </>
            )}
          </div>
          <input
            name="reason"
            placeholder="Grunn (valgfritt) – f.eks. helligdag, arrangement"
            className={`w-full ${inputCls}`}
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              {pending ? "Lagrer …" : "Blokker"}
            </button>
            {msg && (
              <span className={"text-sm " + (err ? "text-danger" : "text-muted")}>
                {msg}
              </span>
            )}
          </div>
        </form>
      )}

      {blocks.length > 0 && (
        <div className="overflow-x-auto border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Dato</th>
                <th className="px-4 py-3">Tid</th>
                <th className="px-4 py-3">Grunn</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id} className="border-t border-line">
                  <td className="px-4 py-3 text-fg">{fmtDate(b.date)}</td>
                  <td className="px-4 py-3 text-muted">
                    {b.start_time && b.end_time
                      ? `${b.start_time}–${b.end_time}`
                      : "Hele dagen"}
                  </td>
                  <td className="px-4 py-3 text-muted">{b.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <ConfirmButton
                      label="Fjern"
                      confirmLabel="Ja, fjern"
                      pendingLabel="Fjerner …"
                      disabled={delPending}
                      onConfirm={() => startDel(() => deleteBookingBlock(b.id))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
