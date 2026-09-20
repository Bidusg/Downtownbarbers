"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  portalCancel,
  portalReschedule,
  portalSlots,
} from "@/app/min-side/[token]/actions";

export type UpcomingBooking = {
  id: string;
  start_at: string;
  service: string | null;
  barber: string | null;
};

const OSLO = "Europe/Oslo";

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
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

const CANCEL_MSG: Record<string, string> = {
  already: "Timen er allerede avbestilt.",
  too_late: "Timen kan ikke avbestilles på nett lenger. Ring oss på +47 463 58 764.",
  not_found: "Noe gikk galt. Last siden på nytt og prøv igjen.",
  error: "Noe gikk galt. Prøv igjen om litt.",
};
const RESCHED_MSG: Record<string, string> = {
  too_late: "Timen kan ikke endres på nett lenger. Ring oss på +47 463 58 764.",
  past: "Velg et tidspunkt fram i tid.",
  taken: "Den tiden ble nettopp opptatt. Velg en annen.",
  invalid: "Ugyldig valg. Prøv en annen tid.",
  not_found: "Noe gikk galt. Last siden på nytt og prøv igjen.",
  error: "Noe gikk galt. Prøv igjen om litt.",
};

function Row({ token, b }: { token: string; b: UpcomingBooking }) {
  const router = useRouter();
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
        setMsg(CANCEL_MSG[r.status] ?? CANCEL_MSG.error);
        setMode("view");
      }
    });
  }

  function pick(t: string) {
    setMsg(null);
    start(async () => {
      const r = await portalReschedule(token, b.id, date, t);
      if (r.status === "ok") {
        router.refresh();
      } else {
        setMsg(RESCHED_MSG[r.status] ?? RESCHED_MSG.error);
        if (r.status === "taken") loadSlots(date);
      }
    });
  }

  return (
    <li className="px-6 py-4">
      <p className="font-medium text-fg">{b.service ?? "Time"}</p>
      <p className="text-sm text-muted capitalize">
        {fmtWhen(b.start_at)}
        {b.barber ? ` · hos ${b.barber}` : ""}
      </p>

      {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={openResched}
            className="border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            Endre tid
          </button>
          <button
            onClick={() => {
              setMsg(null);
              setMode("cancel");
            }}
            className="px-4 py-2 text-sm text-muted transition-colors hover:text-danger"
          >
            Avbestill
          </button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg">Avbestille denne timen?</span>
          <button
            onClick={doCancel}
            disabled={pending}
            className="bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "…" : "Ja, avbestill"}
          </button>
          <button
            onClick={() => setMode("view")}
            disabled={pending}
            className="px-3 py-2 text-sm text-muted hover:text-fg"
          >
            Nei, behold
          </button>
        </div>
      )}

      {mode === "resched" && (
        <div className="mt-3 border-t border-line pt-3">
          <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
            Ny dato
          </label>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => changeDate(e.target.value)}
            className="mb-3 w-full max-w-[12rem] border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
          />

          {loading ? (
            <p className="text-sm text-muted">Henter ledige tider …</p>
          ) : slots && slots.length === 0 ? (
            <p className="text-sm text-muted">
              Ingen ledige tider denne dagen. Prøv en annen dato.
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
            Lukk
          </button>
        </div>
      )}
    </li>
  );
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
        Kommende timer
      </h2>
      <ul className="divide-y divide-line">
        {bookings.map((b) => (
          <Row key={b.id} token={token} b={b} />
        ))}
      </ul>
    </div>
  );
}
