"use client";

import { useState, useTransition } from "react";
import { runEmailDiagnostics, type DiagRow } from "@/app/admin/integrasjoner/email-diag-actions";
import { Button } from "@/components/ui/Button";

/** Admin → Integrasjoner: finn ut hvorfor koder/ordrebekreftelser ikke kommer frem. */
export function EmailDiagCard({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [res, setRes] = useState<{ rows: DiagRow[] } | { error: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="border border-line bg-surface p-5">
      <h3 className="font-semibold text-fg">Feilsøk e-post og kundeinnlogging</h3>
      <p className="mt-2 text-sm text-muted">
        Sjekker alt som trengs for innloggingskoder, registrering og
        ordrebekreftelser, og sender en ekte test-e-post. Viser nøyaktig hva
        Resend svarer.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="din@epost.no"
          autoComplete="email"
          aria-label="Send test-e-post til"
          className="min-h-10 w-64 border border-line bg-bg px-3 text-sm text-fg"
        />
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => start(async () => setRes(await runEmailDiagnostics(to)))}
        >
          {pending ? "Sjekker …" : "Kjør sjekk og send test"}
        </Button>
      </div>
      {res && "error" in res && <p className="mt-3 text-sm text-danger">{res.error}</p>}
      {res && "rows" in res && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {res.rows.map((r) => (
            <li key={r.label} className="flex gap-2 text-sm">
              <span
                aria-hidden
                className={
                  "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                  (r.ok ? "bg-emerald-600/15 text-emerald-700" : "bg-danger/15 text-danger")
                }
              >
                {r.ok ? "✓" : "!"}
              </span>
              <span>
                <strong className="text-fg">{r.label}:</strong>{" "}
                <span className={r.ok ? "text-muted" : "text-danger"}>{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
