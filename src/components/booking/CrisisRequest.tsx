"use client";

import { useState, useTransition } from "react";
import { requestCrisisTime } from "@/app/booking/crisis-actions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * Krisetime for kundeklubb-nivåer med fordelen (f.eks. Platinum). Vises i
 * tidsvalget. Kunden sender en forespørsel; salongen ringer og finner en luke.
 */
export function CrisisRequest({ tierName, service }: { tierName: string; service: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<"i_dag" | "i_morgen">("i_dag");
  const [time, setTime] = useState<"nar_som_helst" | "formiddag" | "ettermiddag" | "kveld">("nar_som_helst");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "login" | "not_allowed" | "too_many" | "server">("idle");
  const [pending, start] = useTransition();

  const chip = (on: boolean) =>
    "min-h-10 rounded-full px-4 text-sm font-medium transition-colors " +
    (on
      ? "bg-fg text-canvas"
      : "bg-surface text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]");

  function send() {
    start(async () => {
      const r = await requestCrisisTime({ service, day, time, note });
      setState(r.ok ? "sent" : (r.error ?? "server"));
    });
  }

  const err =
    state === "login"
      ? t("crisis.errLogin")
      : state === "not_allowed"
        ? t("crisis.errAllowed")
        : state === "too_many"
          ? t("crisis.errMany")
          : state === "server"
            ? t("crisis.errServer")
            : null;

  return (
    <section
      aria-labelledby="crisis-title"
      className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_oklch(var(--line))] sm:p-6"
    >
      <p className="text-[11px] font-semibold tracking-[0.18em] text-accent-ink uppercase">{tierName}</p>
      <h3 id="crisis-title" className="mt-1 text-lg font-semibold tracking-tight text-fg">
        {t("crisis.title")}
      </h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        {t("crisis.lead").replace("{tier}", tierName)}
      </p>

      {state === "sent" ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-[15px] font-medium text-fg">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-fg text-xs text-canvas">
            ✓
          </span>
          {t("crisis.sent")}
        </p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="pill pill-dark mt-4">
          {t("crisis.open")}
        </button>
      ) : (
        <div className="mt-5 space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg">{t("crisis.day")}</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={day === "i_dag"} className={chip(day === "i_dag")} onClick={() => setDay("i_dag")}>
                {t("crisis.today")}
              </button>
              <button
                type="button"
                aria-pressed={day === "i_morgen"}
                className={chip(day === "i_morgen")}
                onClick={() => setDay("i_morgen")}
              >
                {t("crisis.tomorrow")}
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg">{t("crisis.time")}</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["nar_som_helst", "crisis.any"],
                  ["formiddag", "crisis.morning"],
                  ["ettermiddag", "crisis.afternoon"],
                  ["kveld", "crisis.evening"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={time === k} className={chip(time === k)} onClick={() => setTime(k)}>
                  {t(label)}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="crisis-note" className="mb-1.5 block text-sm font-medium text-fg">
              {t("crisis.note")}
            </label>
            <textarea
              id="crisis-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("crisis.notePh")}
              className="w-full resize-y rounded-xl border border-line-2 bg-surface px-4 py-3 text-base text-fg placeholder:text-muted/70 focus:border-fg focus:outline-none"
            />
          </div>
          {err && (
            <p role="alert" className="text-[15px] text-danger">
              {err}
            </p>
          )}
          <button type="button" onClick={send} disabled={pending} className="pill pill-primary disabled:opacity-60">
            {pending ? t("crisis.sending") : t("crisis.send")}
          </button>
        </div>
      )}
    </section>
  );
}
