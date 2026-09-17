"use client";

import { useState, useTransition } from "react";
import { decideLeaveRequest } from "@/app/admin/fravaer/actions";
import type { LeaveRequestAdmin } from "@/lib/ops-queries";

const KIND: Record<string, string> = {
  ferie: "Ferie",
  avspasering: "Avspasering",
  annet: "Annet",
};

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: "Godkjent", cls: "bg-accent-soft/15 text-accent-soft" },
  declined: { label: "Avslått", cls: "bg-danger/10 text-danger" },
  pending: { label: "Til behandling", cls: "bg-accent-soft/15 text-accent-soft" },
};

function fmt(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function period(from: string, to: string) {
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

export function LeaveRequestsAdmin({
  requests,
}: {
  requests: LeaveRequestAdmin[];
}) {
  const [isPending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  function decide(id: string, approve: boolean) {
    setBusyId(id);
    setMsg(null);
    start(async () => {
      const res = await decideLeaveRequest(id, approve);
      setBusyId(null);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
      } else {
        setMsg({
          ok: true,
          text: approve
            ? "Søknad godkjent og lagt inn som fravær."
            : "Søknad avslått.",
        });
      }
    });
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">Fri-søknader</h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-accent-soft/15 px-2.5 py-0.5 text-xs font-semibold text-accent-soft">
            {pending.length} til behandling
          </span>
        )}
      </div>

      {msg && (
        <p
          className={
            "mb-3 text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")
          }
        >
          {msg.text}
        </p>
      )}

      {pending.length === 0 ? (
        <div className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
          Ingen søknader til behandling.
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {pending.map((r) => {
            const busy = isPending && busyId === r.id;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm"
              >
                <span className="font-medium text-fg">{r.staffName}</span>
                <span className="text-fg">{period(r.from_date, r.to_date)}</span>
                <span className="text-muted">{KIND[r.kind] ?? r.kind}</span>
                {r.note && (
                  <span className="w-full text-xs text-muted sm:w-auto">
                    «{r.note}»
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => decide(r.id, true)}
                    disabled={busy}
                    className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                  >
                    {busy ? "…" : "Godkjenn"}
                  </button>
                  <button
                    onClick={() => decide(r.id, false)}
                    disabled={busy}
                    className="border border-line-2 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
                  >
                    Avslå
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {processed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted uppercase">
            Behandlede søknader ({processed.length})
          </summary>
          <ul className="mt-2 divide-y divide-line border border-line bg-surface">
            {processed.map((r) => {
              const st = STATUS[r.status];
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium text-fg">{r.staffName}</span>
                  <span className="text-muted">
                    {period(r.from_date, r.to_date)}
                  </span>
                  <span className="text-muted">{KIND[r.kind] ?? r.kind}</span>
                  <span
                    className={
                      "ml-auto rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                      st.cls
                    }
                  >
                    {st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
