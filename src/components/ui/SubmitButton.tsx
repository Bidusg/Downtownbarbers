"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Send-knapp for <form action={serverAction}>: deaktiveres og viser
 * «Lagrer …» mens skjemaet sendes (hindrer dobbeltklikk).
 */
export function SubmitButton({
  children,
  pendingText = "Lagrer …",
  className = "act act-accent",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
