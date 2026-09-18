"use client";

import { useActionState } from "react";
import {
  migrateContractsToPrivate,
  type ContractMigrationState,
} from "@/app/admin/ansattdokumenter/actions";

/**
 * Engangsknapp: flytt gamle kontrakter fra offentlig staff-files til privat
 * staff-docs. Idempotent – trygt å kjøre flere ganger.
 */
export function ContractMigrationButton() {
  const [state, action, pending] = useActionState<ContractMigrationState, FormData>(
    migrateContractsToPrivate,
    null,
  );

  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="font-display text-lg font-bold">Flytt gamle kontrakter til privat</h2>
          <p className="mt-1 text-sm text-muted">
            Eldre kontrakter ble lagret i en offentlig bøtte. Denne
            engangsjobben flytter dem til privat lagring og fjerner den
            offentlige kopien. Trygt å kjøre flere ganger — allerede flyttede
            hoppes over.
          </p>
        </div>
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="whitespace-nowrap bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Flytter…" : "Flytt nå"}
          </button>
        </form>
      </div>

      {state && (
        <div className="mt-4 border-t border-line pt-3 text-sm">
          {state.ok ? (
            <p className="text-accent-soft">
              Flyttet {state.moved} kontrakt{state.moved === 1 ? "" : "er"} til privat.
              {state.skipped > 0 && ` ${state.skipped} allerede private/hoppet over.`}
            </p>
          ) : (
            <p className="text-danger">Kunne ikke kjøre flyttingen.</p>
          )}
          {state.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-danger">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
