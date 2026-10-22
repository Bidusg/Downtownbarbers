"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  portalCancel,
  portalReschedule,
  portalSlots,
} from "@/app/min-side/[token]/actions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * KOMMENDE TIMER på Min side – med selvbetjening:
 *   • Endre tid: velg dag (neste 3 uker) → velg tid → bekreft flyttingen.
 *   • Avbestill: bekreftes i kortet før noe skjer.
 *   Tider vises på hel og halv time (samme som bookingen).
 * ===================================================================== */

export type UpcomingBooking = {
  id: string;
  start_at: string;
  service: string | null;
  barber: string | null;
  addons?: string[];
};

const OSLO = "Europe/Oslo";

function osloYmd(d: Date) {
  // en-CA gir yyyy-mm-dd
  return d.toLocaleDateString("en-CA", { timeZone: OSLO });
}

// Feilmeldinger slås opp i ordboken (portal.msg.*) etter valgt språk.
const CANCEL_KEYS: Record<string, string> = {
  already: "portal.msg.cancel.already",
  too_late: "portal.msg.cancel.too_late",
  not_found: "portal.msg.not_found",
  error: "portal.msg.error",
};
const RESCHED_KEYS: Record<string, string> = {
  too_late: "portal.msg.resched.too_late",
  past: "portal.msg.resched.past",
  taken: "portal.msg.resched.taken",
  invalid: "portal.msg.resched.invalid",
  not_found: "portal.msg.not_found",
  error: "portal.msg.error",
};

function Row({ token, b }: { token: string; b: UpcomingBooking }) {
  const router = useRouter();
  const { lang, t, tc } = useLanguage();
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"view" | "cancel" | "resched">("view");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [date, setDate] = useState(() => osloYmd(new Date(b.start_at)));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const start_ = new Date(b.start_at);
  const dayLabel = start_.toLocaleDateString(locale, { timeZone: OSLO, weekday: "long", day: "numeric", month: "long" });
  const timeLabel = start_.toLocaleTimeString(locale, { timeZone: OSLO, hour: "2-digit", minute: "2-digit" });

  // Neste 21 dager som velgbare dager.
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso: osloYmd(d),
      weekday: d.toLocaleDateString(locale, { timeZone: OSLO, weekday: "short" }),
      dayNum: String(Number(osloYmd(d).slice(8))),
      month: d.toLocaleDateString(locale, { timeZone: OSLO, month: "short" }),
    };
  });

  function loadSlots(d: string) {
    setLoading(true);
    setSlots(null);
    setChosen(null);
    portalSlots(token, b.id, d)
      .then((s) => setSlots(s.filter((x) => x.endsWith(":00") || x.endsWith(":30"))))
      .catch(() => {
        setSlots([]);
        setMsg(t("portal.msg.error"));
      })
      .finally(() => setLoading(false));
  }

  function openResched() {
    setMsg(null);
    setOkMsg(null);
    setMode("resched");
    loadSlots(date);
  }

  function changeDate(d: string) {
    setDate(d);
    setMsg(null);
    loadSlots(d);
  }

  function doCancel() {
    setMsg(null);
    start(async () => {
      try {
        const r = await portalCancel(token, b.id);
        if (r.status === "ok") {
          setOkMsg(t("portal.cancelledOk"));
          router.refresh();
        } else {
          setMsg(t(CANCEL_KEYS[r.status] ?? CANCEL_KEYS.error));
          setMode("view");
        }
      } catch {
        setMsg(t("portal.msg.error"));
      }
    });
  }

  function doMove() {
    if (!chosen) return;
    setMsg(null);
    start(async () => {
      try {
        const r = await portalReschedule(token, b.id, date, chosen);
        if (r.status === "ok") {
          setOkMsg(t("portal.movedOk"));
          setMode("view");
          router.refresh();
        } else {
          setMsg(t(RESCHED_KEYS[r.status] ?? RESCHED_KEYS.error));
          if (r.status === "taken") loadSlots(date);
          else setChosen(null);
        }
      } catch {
        setMsg(t("portal.msg.error"));
      }
    });
  }

  const chosenLabel = chosen
    ? `${new Date(date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })} ${t("common.at")} ${chosen}`
    : "";

  return (
    <li className="rounded-[28px] bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-24px_rgba(0,0,0,0.18)] sm:p-8">
      <p className="text-sm font-medium text-muted first-letter:uppercase">{dayLabel}</p>
      <p className="m-title mt-1 text-4xl tabular-nums sm:text-5xl">{timeLabel}</p>
      <p className="mt-3 text-[17px] font-medium text-fg">
        {b.service ? tc("services", b.service) : t("portal.appointment")}
        {b.barber ? <span className="font-normal text-muted"> · {t("portal.with")} {b.barber}</span> : null}
      </p>
      {b.addons && b.addons.length > 0 && (
        <p className="mt-0.5 text-sm text-muted">+ {b.addons.map((a) => tc("services", a)).join(", ")}</p>
      )}

      <div aria-live="polite">
        {msg && (
          <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-[15px] text-danger">
            {msg}
          </p>
        )}
        {okMsg && <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-fg">{okMsg}</p>}
      </div>

      {mode === "view" && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={openResched} className="pill pill-dark">
            {t("portal.reschedule")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setOkMsg(null);
              setMode("cancel");
            }}
            className="pill pill-soft"
          >
            {t("portal.cancel")}
          </button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-6 rounded-2xl bg-canvas p-4 sm:p-5">
          <p className="font-medium text-fg">{t("portal.cancelQ")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={doCancel}
              disabled={pending}
              aria-busy={pending}
              className="pill bg-danger text-white hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "…" : t("portal.yesCancel")}
            </button>
            <button type="button" onClick={() => setMode("view")} disabled={pending} className="pill pill-soft">
              {t("portal.noKeep")}
            </button>
          </div>
        </div>
      )}

      {mode === "resched" && (
        <div className="mt-6 space-y-5 border-t border-line pt-6">
          {chosen ? (
            <div className="rounded-2xl bg-canvas p-4 sm:p-5">
              <p className="text-fg">
                {t("portal.moveQ")} <span className="font-semibold">{chosenLabel}</span>?
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={doMove}
                  disabled={pending}
                  aria-busy={pending}
                  className="pill pill-primary disabled:opacity-60"
                >
                  {pending ? "…" : t("portal.yesMove")}
                </button>
                <button type="button" onClick={() => setChosen(null)} disabled={pending} className="pill pill-soft">
                  {t("portal.back")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-3 text-[13px] font-semibold text-muted">{t("portal.pickDay")}</p>
                <div className="snap-row -mx-6 gap-2 px-6 pb-1 sm:-mx-8 sm:px-8">
                  {days.map((d) => {
                    const on = d.iso === date;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => changeDate(d.iso)}
                        aria-pressed={on}
                        aria-label={`${d.weekday} ${d.dayNum}. ${d.month}`}
                        className={
                          "flex w-16 flex-col items-center rounded-2xl py-2.5 transition-colors " +
                          (on
                            ? "bg-fg text-canvas"
                            : "bg-canvas text-fg shadow-[0_0_0_1px_oklch(var(--line))] hover:shadow-[0_0_0_1px_oklch(var(--line-2))]")
                        }
                      >
                        <span className={"text-[11px] font-medium " + (on ? "text-canvas/70" : "text-muted")}>{d.weekday}</span>
                        <span className="text-xl font-semibold tracking-tight tabular-nums">{d.dayNum}</span>
                        <span className={"text-[11px] " + (on ? "text-canvas/70" : "text-muted")}>{d.month}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-3 text-[13px] font-semibold text-muted">{t("portal.pickTime")}</p>
                {loading ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-busy="true" aria-label={t("portal.loadingSlots")}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span key={i} className="h-11 animate-pulse rounded-full bg-surface-2" />
                    ))}
                  </div>
                ) : slots && slots.length === 0 ? (
                  <p className="text-muted">{t("portal.noSlotsDay")}</p>
                ) : slots ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setChosen(s)}
                        className="min-h-11 rounded-full bg-canvas text-[15px] font-medium text-fg tabular-nums shadow-[0_0_0_1px_oklch(var(--line))] transition-colors hover:bg-fg hover:text-canvas"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setMode("view");
              setMsg(null);
              setChosen(null);
            }}
            className="m-link min-h-11"
          >
            {t("portal.close")}
          </button>
        </div>
      )}
    </li>
  );
}

export function UpcomingBookings({ token, bookings }: { token: string; bookings: UpcomingBooking[] }) {
  const { t } = useLanguage();
  if (bookings.length === 0) {
    return (
      <div className="mt-4 rounded-[28px] bg-surface p-8 text-center shadow-[0_0_0_1px_oklch(var(--line))]">
        <p className="text-muted">{t("portal.noUpcoming")}</p>
        <a href="/booking" className="pill pill-soft mt-5">
          {t("common.bookNew")}
        </a>
      </div>
    );
  }
  return (
    <ul className="mt-4 space-y-4">
      {bookings.map((b) => (
        <Row key={b.id} token={token} b={b} />
      ))}
    </ul>
  );
}
