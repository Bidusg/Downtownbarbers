"use client";

import { useActionState, useState } from "react";
import { sendContactMessage, type ContactState } from "@/app/kontakt-actions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const TOPICS = ["sporsmal", "gavekort", "bedrift", "tilbakemelding", "annet"] as const;

const FIELD =
  "w-full rounded-xl border border-line-2 bg-surface px-4 py-3 text-base text-fg transition-colors placeholder:text-muted/70 focus:border-fg focus:outline-none aria-[invalid=true]:border-danger";
const LABEL = "mb-1.5 block text-sm font-medium text-fg";

/**
 * «Send oss en melding» – kontaktskjema på forsiden. Meldingen havner i
 * admin → Henvendelser og som e-post til salongen.
 */
export function ContactForm() {
  const { t } = useLanguage();
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, null);
  const [topic, setTopic] = useState<string>("sporsmal");
  const [callback, setCallback] = useState(false);
  // Kontrollerte felt: React nullstiller ellers skjemaet etter innsending,
  // og kunden mister teksten hvis noe må rettes.
  const [v, setV] = useState({ name: "", phone: "", email: "", message: "" });
  const bind = (k: keyof typeof v) => ({
    name: k,
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value })),
  });
  // Når skjemaet ble vist (roboter sender på millisekunder).
  const [startedAt] = useState(() => Date.now());

  const bad = new Set(state && !state.ok ? (state.fields ?? []) : []);

  if (state?.ok) {
    return (
      <div role="status" className="flex h-full flex-col items-start justify-center py-6">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-fg text-xl text-canvas"
        >
          ✓
        </span>
        <h3 className="mt-5 text-2xl font-semibold tracking-tight">{t("contact.sentTitle")}</h3>
        <p className="mt-2 max-w-md text-[17px] text-muted">
          {callback ? t("contact.sentCallback") : t("contact.sentBody")}
        </p>
      </div>
    );
  }

  const errorText =
    state && !state.ok
      ? state.error === "contact"
        ? t("contact.errContact")
        : state.error === "rate"
          ? t("contact.errRate")
          : state.error === "server"
            ? t("contact.errServer")
            : t("contact.errInvalid")
      : null;

  return (
    <form action={action} className="space-y-5" noValidate>
      {/* Honeypot + tidsstempel (skjult for mennesker). */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="t" value={startedAt} />
      <input type="hidden" name="topic" value={topic} />

      <fieldset>
        <legend className={LABEL}>{t("contact.topic")}</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((k) => {
            const on = topic === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setTopic(k)}
                className={
                  "min-h-10 rounded-full px-4 text-sm font-medium transition-colors " +
                  (on
                    ? "bg-fg text-canvas"
                    : "bg-surface text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]")
                }
              >
                {t(`contact.topic.${k}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="c-name" className={LABEL}>
          {t("contact.name")}
        </label>
        <input id="c-name" {...bind("name")} autoComplete="name" required aria-invalid={bad.has("name")} className={FIELD} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-phone" className={LABEL}>
            {t("contact.phone")}
          </label>
          <input
            id="c-phone"
            {...bind("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={bad.has("phone")}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="c-email" className={LABEL}>
            {t("contact.email")}
          </label>
          <input
            id="c-email"
            {...bind("email")}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            aria-invalid={bad.has("email")}
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="c-msg" className={LABEL}>
          {t("contact.message")}
        </label>
        <textarea
          id="c-msg"
          {...bind("message")}
          rows={5}
          required
          maxLength={2000}
          aria-invalid={bad.has("message")}
          placeholder={t("contact.messagePh")}
          className={FIELD + " resize-y"}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-[15px] text-fg">
        <input
          type="checkbox"
          name="callback"
          checked={callback}
          onChange={(e) => setCallback(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[oklch(var(--fg))]"
        />
        <span>{t("contact.callback")}</span>
      </label>

      {errorText && (
        <p role="alert" className="text-[15px] text-danger">
          {errorText}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="pill pill-dark disabled:opacity-60">
          {pending ? t("contact.sending") : t("contact.send")}
        </button>
        <p className="text-sm text-muted">{t("contact.reply")}</p>
      </div>
    </form>
  );
}
