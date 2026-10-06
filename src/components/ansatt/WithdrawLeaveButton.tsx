"use client";

import { useState, useTransition } from "react";
import { withdrawLeaveRequest } from "@/app/ansatt/fravaer/actions";

export function WithdrawLeaveButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return <span className="text-xs text-danger">{error}</span>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="act act-danger"
      >
        Trekk tilbake
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">Sikker?</span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await withdrawLeaveRequest(id);
            if (!res.ok) setError(res.error);
          })
        }
        className="act act-danger"
      >
        {pending ? "Trekker …" : "Ja, trekk"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-muted hover:text-fg disabled:opacity-40"
      >
        Avbryt
      </button>
    </span>
  );
}
