"use client";

import { useState, useTransition } from "react";

/**
 * Bekreftelse på destruktive handlinger. Første klikk viser «Sikker?» med
 * «Ja …»/«Avbryt» i stedet for å utføre handlingen med en gang.
 *
 * To moduser:
 *  1. onConfirm — kaller callbacken (f.eks. en server action) og håndterer
 *     sin egen pending-tilstand. Brukes i klient-komponenter (managers).
 *  2. submit — bekreft-knappen er `type="submit"`, så den sender det
 *     omkringliggende `<form action={…}>`. Brukes for server-action-skjemaer.
 *
 * Returnerer onConfirm en `{ ok:false, error }`, vises feilen i stedet.
 */
export function ConfirmButton({
  label,
  question = "Sikker?",
  confirmLabel = "Ja",
  pendingLabel,
  onConfirm,
  submit = false,
  className = "text-xs text-danger hover:underline",
  confirmClassName = "text-xs font-semibold text-danger hover:underline disabled:opacity-40",
  disabled = false,
}: {
  /** Tekst på hvile-knappen, f.eks. «Slett». */
  label: string;
  /** Spørsmålet som vises ved bekreftelse. */
  question?: string;
  /** Tekst på bekreft-knappen, f.eks. «Ja, slett». */
  confirmLabel?: string;
  /** Tekst mens handlingen kjører (default: confirmLabel + « …»). */
  pendingLabel?: string;
  /** Callback-modus: kalles når brukeren bekrefter. */
  onConfirm?: () => void | Promise<{ ok: boolean; error?: string } | unknown>;
  /** Skjema-modus: bekreft-knappen sender det omkringliggende <form>. */
  submit?: boolean;
  className?: string;
  confirmClassName?: string;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-danger">{error}</span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(false);
          }}
          className="text-muted hover:text-fg"
        >
          Lukk
        </button>
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        className={className + (disabled ? " opacity-40" : "")}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted">{question}</span>
      <button
        type={submit ? "submit" : "button"}
        disabled={pending}
        onClick={
          submit
            ? undefined
            : () =>
                start(async () => {
                  const res = (await onConfirm?.()) as
                    | { ok: boolean; error?: string }
                    | undefined;
                  if (res && res.ok === false) {
                    setError(res.error ?? "Handlingen feilet. Prøv igjen.");
                    setConfirming(false);
                  }
                })
        }
        className={confirmClassName}
      >
        {pending ? (pendingLabel ?? `${confirmLabel} …`) : confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-muted hover:text-fg disabled:opacity-40"
      >
        Avbryt
      </button>
    </span>
  );
}
