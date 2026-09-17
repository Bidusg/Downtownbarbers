"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = {};

export function ForgotForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initial,
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold">Downtown Barbers</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Glemt passord
          </p>
        </div>

        {state.sent ? (
          <div className="border border-line bg-surface p-6 text-center">
            <p className="text-sm text-fg">
              Hvis e-posten finnes hos oss, har vi sendt en lenke for å
              tilbakestille passordet.
            </p>
            <p className="mt-3 text-xs text-muted">
              Sjekk innboksen (og eventuelt søppelpost). Lenken er gyldig en
              begrenset periode.
            </p>
            <a
              href="/logg-inn"
              className="mt-5 inline-block text-xs text-accent-soft hover:underline"
            >
              Tilbake til innlogging
            </a>
          </div>
        ) : (
          <form
            action={formAction}
            className="space-y-4 border border-line bg-surface p-6"
          >
            <p className="text-sm text-muted">
              Skriv inn e-postadressen din, så sender vi deg en lenke for å
              sette et nytt passord.
            </p>
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

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Sender …" : "Send tilbakestillingslenke"}
            </button>

            <p className="text-center text-xs">
              <a
                href="/logg-inn"
                className="text-muted hover:text-accent-soft hover:underline"
              >
                Tilbake til innlogging
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
