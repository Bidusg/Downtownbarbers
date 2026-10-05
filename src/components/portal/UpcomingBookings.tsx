"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  portalCancel,
  portalReschedule,
  portalSlots,
} from "@/app/min-side/[token]/actions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { translateContent } from "@/lib/i18n/content-map";

export type UpcomingBooking = {
  id: string;
  start_at: string;
  service: string | null;
  barber: string | null;
  addons?: string[];
};

const OSLO = "Europe/Oslo";

function fmtWhen(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale, {
      timeZone: OSLO,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
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
  const { lang, t } = useLanguage();
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"view" | "cancel" | "resched">("view");
  const [msg, setMsg] = useState<string | null>(null);

  const [date, setDate] = useState(() => osloYmd(new Date(b.start_at)));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const today = osloYmd(new Date());

  function loadSlots(d: string) {
    setLoading(true);
    setSlots(null);
    portalSlots(token, b.id, d).then((s) => {
      setSlots(s);
      setLoading(false);
    });
  }

  function openResched() {
    setMsg(null);
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
      const r = await portalCancel(token, b.id);
      if (r.status === "ok") {
        router.refresh();
      } else {
        setMsg(t(CANCEL_KEYS[r.status] ?? CANCEL_KEYS.error));
        setMode("view");
      }
    });
  }

  function pick(hhmm: string) {
    setMsg(null);
    start(async () => {
      const r = await portalReschedule(token, b.id, date, hhmm);
      if (r.status === "ok") {
        router.refresh();
      } else {
        setMsg(t(RESCHED_KEYS[r.status] ?? RESCHED_KEYS.error));
        if (r.status === "taken") loadSlots(date);
      }
    });
  }

  return (
    <li className="px-6 py-4">
      <p className="font-medium text-fg">
        {b.service ? translateContent("services", b.service, lang) : t("portal.appointment")}
      </p>
      <p className="text-sm text-muted capitalize">
        {fmtWhen(b.start_at, locale)}
        {b.barber ? ` · ${t("portal.with")} ${b.barber}` : ""}
      </p>
      {b.addons && b.addons.length > 0 && (
        <p className="mt-0.5 text-xs text-muted">
          + {b.addons.map((a) => translateContent("services", a, lang)).join(", ")}
        </p>
      )}

      {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={openResched}
            className="border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            {t("portal.reschedule")}
          </button>
          <button
            onClick={() => {
              setMsg(null);
              setMode("cancel");
            }}
            className="px-4 py-2 text-sm text-muted transition-colors hover:text-danger"
          >
            {t("portal.cancel")}
          </button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg">{t("portal.cancelQ")}</span>
          <button
            onClick={doCancel}
            disabled={pending}
            className="bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "…" : t("portal.yesCancel")}
          </button>
          <button
            onClick={() => setMode("view")}
            disabled={pending}
            className="px-3 py-2 text-sm text-muted hover:text-fg"
          >
            {t("portal.noKeep")}
          </button>
        </div>
      )}

      {mode === "resched" && (
        <div className="mt-3 border-t border-line pt-3">
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            {t("portal.newDate")}
          </label>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => changeDate(e.target.value)}
            className="mb-3 w-full max-w-[12rem] border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
          />

          {loading ? (
            <p className="text-sm text-muted">{t("portal.loadingSlots")}</p>
          ) : slots && slots.length === 0 ? (
            <p className="text-sm text-muted">
              {t("portal.noSlotsDay")}
            </p>
          ) : slots ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {slots.map((t) => (
                <button
                  key={t}
                  onClick={() => pick(t)}
                  disabled={pending}
                  className="border border-line py-2 text-sm text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-50"
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}

          <button
            onClick={() => {
              setMode("view");
              setMsg(null);
            }}
            className="mt-3 text-sm text-muted hover:text-fg"
          >
            {t("portal.close")}
          </button>
        </div>
      )}
    </li>
  );
}

function UpcomingTitle() {
  const { t } = useLanguage();
  return <>{t("portal.upcoming")}</>;
}

export function UpcomingBookings({
  token,
  bookings,
}: {
  token: string;
  bookings: UpcomingBooking[];
}) {
  if (bookings.length === 0) return null;
  return (
    <div className="mb-6 border border-line bg-surface">
      <h2 className="border-b border-line px-6 py-4 font-display text-lg font-bold">
        <UpcomingTitle />
      </h2>
      <ul className="divide-y divide-line">
        {bookings.map((b) => (
          <Row key={b.id} token={token} b={b} />
        ))}
      </ul>
    </div>
  );
}
