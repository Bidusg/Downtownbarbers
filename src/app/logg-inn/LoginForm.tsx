"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  signIn,
  requestLoginCode,
  registerCustomer,
  verifyLoginCode,
  type LoginState,
  type CodeRequestState,
  type VerifyState,
} from "./actions";

const loginInitial: LoginState = {};
const codeInitial: CodeRequestState = {};
const verifyInitial: VerifyState = {};

const fieldCls =
  "w-full rounded-xl border border-line-2 bg-canvas px-3.5 py-3 text-[15px] text-fg outline-none transition-colors focus:border-accent-soft";
const labelCls = "mb-1.5 block text-[13px] font-semibold text-muted";
/** Sekunder før kunden kan be om en ny kode. */
const RESEND_COOLDOWN = 30;

const primaryBtn =
  "w-full rounded-full bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-60 min-h-11";

/**
 * Kunde-innlogging med engangskode på e-post. «Ny kunde» oppretter konto.
 * Etter riktig kode er kunden innlogget på enheten (Min side uten lenke).
 */
function CustomerForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [reqState, reqAction, reqPending] = useActionState(requestLoginCode, codeInitial);
  const [regState, regAction, regPending] = useActionState(registerCustomer, codeInitial);
  const [verState, verAction, verPending] = useActionState(verifyLoginCode, verifyInitial);
  // «Bruk en annen e-post»: skjul kode-steget for akkurat dette svaret.
  const [dismissed, setDismissed] = useState<CodeRequestState | null>(null);

  const active = mode === "login" ? reqState : regState;
  const codeEmail = active.step === "code" && active !== dismissed ? active.email ?? "" : null;

  useEffect(() => {
    if (verState.redirect) router.push(verState.redirect);
  }, [verState.redirect, router]);

  // Siste svar for denne e-posten (første utsending eller «Send ny kode»).
  const latest =
    codeEmail !== null && reqState.email === codeEmail && (reqState.at ?? 0) > (active.at ?? 0) ? reqState : active;
  const sentAt = latest.at ?? 0;
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN * 1000 - now) / 1000));
  useEffect(() => {
    if (!sentAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start nedtellingen med en gang
    setNow(Date.now());
    const iv = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() > sentAt + RESEND_COOLDOWN * 1000) window.clearInterval(iv);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [sentAt]);
  const resent = latest !== active;
  const sentClock = sentAt
    ? new Date(sentAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  const err = (k?: string) => (k ? t(`login.err.${k}`) : null);

  if (codeEmail !== null) {
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <div>
          <p className="text-lg font-semibold tracking-tight text-fg">{t("login.cust.codeTitle")}</p>
          <p className="mt-2 text-sm text-muted">
            {t("login.cust.codeText").replace("{email}", codeEmail || "e-posten")}
          </p>
          {latest.notice === "failed" ? (
            <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {t("login.cust.sendFailed")}
            </p>
          ) : latest.notice === "limited" ? (
            <p role="alert" className="mt-3 rounded-lg bg-accent-soft/10 px-3 py-2 text-sm text-fg">
              {t("login.cust.limited")}
            </p>
          ) : (
            <p role="status" aria-live="polite" className="mt-3 text-xs text-muted">
              {(resent ? t("login.cust.resentAt") : t("login.cust.sentAt")).replace("{time}", sentClock)} {t("login.cust.spamHint")}
            </p>
          )}
        </div>
        <form action={verAction} className="space-y-3">
          <input type="hidden" name="email" value={codeEmail} />
          <div>
            <label htmlFor="f-code" className={labelCls}>
              {t("login.cust.code")}
            </label>
            <input
              id="f-code"
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              autoFocus
              placeholder="123456"
              className={fieldCls + " text-center text-2xl tracking-[0.4em] tabular-nums"}
            />
          </div>
          {verState.error && (
            <p role="alert" className="text-sm text-danger">
              {err(verState.error)}
            </p>
          )}
          <button type="submit" disabled={verPending} className={primaryBtn}>
            {verPending ? t("login.cust.verifying") : t("login.cust.verify")}
          </button>
          <p className="text-center text-xs text-muted">{t("login.cust.remember")}</p>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
          <form action={reqAction}>
            <input type="hidden" name="email" value={codeEmail} />
            <button
              type="submit"
              disabled={reqPending || regPending || left > 0}
              className="m-link min-h-11 disabled:cursor-not-allowed disabled:opacity-50 tabular-nums"
              aria-live="polite"
            >
              {reqPending
                ? t("login.cust.sending")
                : left > 0
                  ? t("login.cust.resendIn").replace("{s}", String(left))
                  : t("login.cust.resend")}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setDismissed(active)}
            className="min-h-11 text-muted hover:text-fg"
          >
            {t("login.cust.otherEmail")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "register") {
    return (
      <form action={regAction} className="space-y-4 rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-muted">{t("login.cust.registerIntro")}</p>
        {/* Honeypot – skjult for mennesker */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <div>
          <label htmlFor="r-name" className={labelCls}>
            {t("login.cust.name")}
          </label>
          <input id="r-name" name="name" required autoComplete="name" className={fieldCls} />
        </div>
        <div>
          <label htmlFor="r-email" className={labelCls}>
            {t("login.cust.email")}
          </label>
          <input
            id="r-email"
            type="email"
            name="email"
            required
            spellCheck={false}
            autoComplete="email"
            inputMode="email"
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="r-phone" className={labelCls}>
            {t("login.cust.phone")}
          </label>
          <input id="r-phone" type="tel" name="phone" autoComplete="tel" inputMode="tel" className={fieldCls} />
        </div>
        {regState.error && (
          <p role="alert" className="text-sm text-danger">
            {err(regState.error)}
          </p>
        )}
        <button type="submit" disabled={regPending} className={primaryBtn}>
          {regPending ? t("login.cust.sending") : t("login.cust.create")}
        </button>
        <button type="button" onClick={() => setMode("login")} className="m-link mx-auto block min-h-11 text-sm">
          {t("login.cust.have")}
        </button>
      </form>
    );
  }

  return (
    <form action={reqAction} className="space-y-4 rounded-2xl border border-line bg-surface p-6">
      <p className="text-sm text-muted">{t("login.cust.intro")}</p>
      <div>
        <label htmlFor="f-email" className={labelCls}>
          {t("login.cust.email")}
        </label>
        <input
          id="f-email"
          type="email"
          spellCheck={false}
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          className={fieldCls}
        />
      </div>
      {reqState.error && (
        <p role="alert" className="text-sm text-danger">
          {err(reqState.error)}
        </p>
      )}
      <button type="submit" disabled={reqPending} className={primaryBtn}>
        {reqPending ? t("login.cust.sending") : t("login.cust.sendCode")}
      </button>
      <button type="button" onClick={() => setMode("register")} className="m-link mx-auto block min-h-11 text-sm">
        {t("login.cust.new")}
      </button>
    </form>
  );
}

/** Ansatt/admin-innlogging: e-post + passord. */
function StaffForm({
  accessDenied,
  passwordReset,
  next,
}: {
  accessDenied: boolean;
  passwordReset: boolean;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(signIn, loginInitial);

  return (
    <>
      {accessDenied && (
        <div role="alert" className="mb-4 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          Du har ikke tilgang til den siden. Logg inn med en konto som har
          tilgang.
        </div>
      )}
      {passwordReset && (
        <div role="status" className="mb-4 border border-accent-soft/40 bg-accent-soft/10 px-4 py-3 text-sm text-accent-ink">
          Passordet er oppdatert. Logg inn med det nye passordet ditt.
        </div>
      )}

      <form action={formAction} className="space-y-4 border border-line bg-surface p-6">
        {next && <input type="hidden" name="neste" value={next} />}
        <div>
          <label htmlFor="f-email-staff" className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
            E-post
          </label>
          <input
            id="f-email-staff"
            type="email"
            spellCheck={false}
            name="email"
            required
            autoComplete="email"
            className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
          />
        </div>
        <div>
          <label htmlFor="f-password" className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
            Passord
          </label>
          <input
            id="f-password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
          />
        </div>

        {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}

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
  staffTab = false,
  compact = false,
  next = "",
}: {
  accessDenied?: boolean;
  passwordReset?: boolean;
  /** Start på «Ansatt / admin»-fanen (sendt hit fra admin/kasse/revisor). */
  staffTab?: boolean;
  /** compact = inne i en popup (ingen helsides ramme). */
  compact?: boolean;
  /** Back-office-side å gå til etter innlogging. */
  next?: string;
}) {
  // Ansatte som blir sendt hit av en tilgangsvakt (feil=tilgang) eller etter
  // passordbytte havner rett på ansatt-fanen; ellers er kunde-fanen standard.
  const [tab, setTab] = useState<"kunde" | "ansatt">(
    accessDenied || passwordReset || staffTab ? "ansatt" : "kunde",
  );

  return (
    <div
      className={
        compact
          ? "text-fg"
          : "flex min-h-screen items-center justify-center bg-canvas px-5 py-16 text-fg"
      }
    >
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
          <StaffForm accessDenied={accessDenied} passwordReset={passwordReset} next={next} />
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
