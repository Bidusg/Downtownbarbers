"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  signIn,
  requestPortalLink,
  type LoginState,
  type PortalLinkState,
} from "./actions";

const loginInitial: LoginState = {};
const portalInitial: PortalLinkState = {};

/** Kunde-innlogging: passordløs magisk lenke til «Min side». */
function CustomerForm() {
  const [state, formAction, pending] = useActionState(
    requestPortalLink,
    portalInitial,
  );

  if (state.sent) {
    return (
      <div className="border border-line bg-surface p-6 text-center">
        <p className="font-display text-lg font-bold text-fg">Sjekk e-posten din 📩</p>
        <p className="mt-3 text-sm text-muted">
          Finnes det en konto på denne e-posten, har vi sendt deg en lenke til
          Min side. Lenken er personlig – ikke del den.
        </p>
        <p className="mt-4 text-xs text-muted">
          Får du ingen e-post?{" "}
          <Link href="/booking" className="text-accent-soft hover:underline">
            Bestill en time
          </Link>{" "}
          – så oppretter vi profilen din automatisk.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 border border-line bg-surface p-6">
      <p className="text-sm text-muted">
        Skriv inn e-posten du booket med, så sender vi deg en lenke rett til Min
        side – ingen passord nødvendig.
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
          inputMode="email"
          className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Sender …" : "Send meg lenken"}
      </button>
    </form>
  );
}

/** Ansatt/admin-innlogging: e-post + passord. */
function StaffForm({
  accessDenied,
  passwordReset,
}: {
  accessDenied: boolean;
  passwordReset: boolean;
}) {
  const [state, formAction, pending] = useActionState(signIn, loginInitial);

  return (
    <>
      {accessDenied && (
        <div className="mb-4 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          Du har ikke tilgang til den siden. Logg inn med en konto som har
          tilgang.
        </div>
      )}
      {passwordReset && (
        <div className="mb-4 border border-accent-soft/40 bg-accent-soft/10 px-4 py-3 text-sm text-accent-soft">
          Passordet er oppdatert. Logg inn med det nye passordet ditt.
        </div>
      )}

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

        {state.error && <p className="text-sm text-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Logger inn …" : "Logg inn"}
        </button>

        <p className="text-center text-xs">
          <a
            href="/glemt-passord"
            className="text-muted hover:text-accent-soft hover:underline"
          >
            Glemt passord?
          </a>
        </p>
      </form>
    </>
  );
}

export function LoginForm({
  accessDenied = false,
  passwordReset = false,
}: {
  accessDenied?: boolean;
  passwordReset?: boolean;
}) {
  // Ansatte som blir sendt hit av en tilgangsvakt (feil=tilgang) eller etter
  // passordbytte havner rett på ansatt-fanen; ellers er kunde-fanen standard.
  const [tab, setTab] = useState<"kunde" | "ansatt">(
    accessDenied || passwordReset ? "ansatt" : "kunde",
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-16 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold">Downtown Barbers</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Innlogging
          </p>
        </div>

        {/* Fane-velger: kunde (magisk lenke) vs. ansatt/admin (passord). */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface p-1">
          {(["kunde", "ansatt"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "rounded-md px-3 py-2 text-sm font-semibold transition-colors " +
                (tab === t
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {t === "kunde" ? "Kunde" : "Ansatt / admin"}
            </button>
          ))}
        </div>

        {tab === "kunde" ? (
          <CustomerForm />
        ) : (
          <StaffForm accessDenied={accessDenied} passwordReset={passwordReset} />
        )}

        <p className="mt-5 text-center text-xs text-muted">
          {tab === "kunde"
            ? "Er du ansatt, shop eller revisor? Velg «Ansatt / admin»."
            : "Admin, shop, revisor og ansatt logger inn her – du sendes til riktig side automatisk."}
        </p>
      </div>
    </div>
  );
}
