"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ABSENCE_KINDS } from "@/lib/absence-kinds";
import { updateAbsenceKind } from "@/app/admin/fravaer/actions";

/** Bytt fraværstype rett fra Lønn – lønnen regnes om med en gang. */
export function AbsenceKindSelect({ id, kind }: { id: string; kind: string }) {
  const router = useRouter();
  const [value, setValue] = useState(kind);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const deduct = ABSENCE_KINDS.find((k) => k.value === value)?.deduct;
  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          setErr(null);
          start(async () => {
            const r = await updateAbsenceKind(id, v);
            if (r.error) {
              setErr(r.error);
              setValue(kind);
            } else router.refresh();
          });
        }}
        className={
          "rounded-md border bg-canvas px-2 py-1 text-xs " +
          (deduct ? "border-danger/50 text-danger" : "border-line-2 text-fg")
        }
      >
        {ABSENCE_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
            {k.deduct ? " (trekkes)" : ""}
          </option>
        ))}
      </select>
      {pending && <span className="text-[11px] text-muted">Regner om …</span>}
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </span>
  );
}
