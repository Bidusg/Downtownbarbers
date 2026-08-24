"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoggInn() {
  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold">Downtown Barbers</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Innlogging
          </p>
        </div>

        <form action={formAction} className="space-y-4 border border-line bg-surface p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
              E-post
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
              Passord
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
            />
          </div>

          {state.error && (
            <p className="text-sm text-danger">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Logger inn …" : "Logg inn"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          Admin, shop og ansatt logger inn her – du sendes til riktig side automatisk.
        </p>
      </div>
    </div>
  );
}
