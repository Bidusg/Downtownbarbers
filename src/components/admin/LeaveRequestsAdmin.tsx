"use client";

import { useState, useTransition } from "react";
import { decideLeaveRequest } from "@/app/admin/fravaer/actions";
import type { LeaveRequestAdmin } from "@/lib/ops-queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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

const STATUS_TONE: Record<string, BadgeTone> = {
  approved: "success",
  declined: "danger",
  pending: "warning",
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
          <Badge tone="warning">{pending.length} til behandling</Badge>
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
        <EmptyState description="Ingen søknader til behandling." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
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
                  <Button
                    variant="primary"
                    onClick={() => decide(r.id, true)}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs"
                  >
                    {busy ? "…" : "Godkjenn"}
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={() => decide(r.id, false)}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs"
                  >
                    Avslå
                  </Button>
                </div>
              </li>
            );
          })}
          </ul>
        </Card>
      )}

      {processed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted uppercase">
            Behandlede søknader ({processed.length})
          </summary>
          <Card padded={false} className="mt-2">
            <ul className="divide-y divide-line">
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
                  <Badge
                    tone={STATUS_TONE[r.status] ?? "neutral"}
                    className="ml-auto"
                  >
                    {st.label}
                  </Badge>
                </li>
              );
            })}
            </ul>
          </Card>
        </details>
      )}
    </section>
  );
}
