"use client";

import { useState, useTransition } from "react";
import { deleteMyDocument } from "@/app/ansatt/dokumenter/actions";

export function DeleteDocumentButton({ id }: { id: string }) {
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
        className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-danger hover:underline"
      >
        Slett
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
            const res = await deleteMyDocument(id);
            if (!res.ok) setError(res.error);
          })
        }
        className="font-semibold text-danger hover:underline disabled:opacity-40"
      >
        {pending ? "Sletter …" : "Ja, slett"}
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
