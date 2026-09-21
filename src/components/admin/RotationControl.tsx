"use client";

import { useState, useTransition } from "react";
import { setTurnusRotation } from "@/app/admin/timelister/actions";
import { MAX_ROTATION_WEEKS, parityLabel } from "@/lib/turnus";

export function RotationControl({ weeks }: { weeks: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          setMsg(null);
          setErr(false);
          const r = await setTurnusRotation(fd);
          if (r.error) {
            setErr(true);
            setMsg(r.error);
          } else {
            setMsg("Lagret ✓");
          }
        })
      }
      className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted"
    >
      <span>Rotasjon:</span>
      <select
        name="weeks"
        defaultValue={String(weeks)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus:border-accent-soft focus:outline-none"
      >
        {Array.from({ length: MAX_ROTATION_WEEKS }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n === 1
              ? "1 uke (ingen rotasjon)"
              : `${n} uker (${Array.from({ length: n }, (_, i) => parityLabel(i + 1).replace("Uke ", "")).join("/")})`}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name="reanchor" className="accent-accent" />
        Start rotasjonen på denne uken (uke A = nå)
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line-2 px-3 py-1 font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-40"
      >
        {pending ? "Lagrer …" : "Lagre rotasjon"}
      </button>
      {msg && (
        <span className={err ? "text-danger" : "text-accent-soft"}>{msg}</span>
      )}
      <span className="text-[11px]">
        Definer mønsteret én gang – systemet regner ut hvilken uke som gjelder
        framover.
      </span>
    </form>
  );
}
