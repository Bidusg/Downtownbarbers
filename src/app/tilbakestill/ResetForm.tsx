"use client";

import { useActionState } from "react";
import { setNewPassword, type ResetState } from "./actions";

const initial: ResetState = {};

export function ResetForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, initial);

  return (
    <form
      action={formAction}
      className="space-y-4 border border-line bg-surface p-6"
    >
      <p className="text-sm text-muted">Velg et nytt passord for kontoen din.</p>
      <div>
        <label htmlFor="f-password" className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
          Nytt passord
        </label>
        <input
            id="f-password"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
        />
      </div>
      <div>
        <label htmlFor="f-confirm" className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
          Gjenta passord
        </label>
        <input
            id="f-confirm"
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
        />
      </div>

      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Lagrer …" : "Lagre nytt passord"}
      </button>
    </form>
  );
}
