"use client";

import { useState, useTransition } from "react";
import { rebookCreate, rebookOptions, type RebookOptions } from "@/app/kasse/actions";

const WEEKS = [2, 3, 4, 5, 6, 8];

function prettyDate(iso: string) {
  const s = new Date(`${iso}T12:00:00Z`).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Vises rett etter at betalingen er registrert: book neste time for samme
 * kunde, samme behandling og barber, N uker frem. Kan lukkes med ✕ / «Ferdig».
 */
export function RebookPanel({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [weeks, setWeeks] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [opts, setOpts] = useState<RebookOptions | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(w: number) {
    setWeeks(w);
    setErr(null);
    setOpts(null);
    start(async () => {
      const r = await rebookOptions(bookingId, w);
      if (r.error) setErr(r.error);
      else setOpts(r);
    });
  }

  function book(time: string) {
    if (!opts) return;
    setErr(null);
    start(async () => {
      const r = await rebookCreate(bookingId, opts.date, time);
      if (r.error) setErr(r.error);
      else setBooked(`${prettyDate(opts.date)} kl. ${time}`);
    });
  }

  return (
    <div className="rounded-lg border border-accent-soft/40 bg-accent-soft/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-fg">Betaling registrert ✓</p>
          <p className="text-sm text-muted">
            {booked ? "Ny time er booket." : "Vil kunden booke neste time med en gang?"}
          </p>
        </div>
        <button type="button" onClick={onClose} className="act" aria-label="Lukk">
          ✕
        </button>
      </div>

      {booked ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-md bg-surface px-3 py-2 text-sm text-fg">
            ✓ {opts?.customerName ? `${opts.customerName} – ` : ""}
            {opts?.service} hos {opts?.barber}, <span className="font-semibold">{booked}</span>.
            Bekreftelse er sendt på SMS/e-post.
          </p>
          <button type="button" className="act act-accent" onClick={onClose}>
            Ferdig
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">Rebook om</span>
            {WEEKS.map((w) => (
              <button
                key={w}
                type="button"
                disabled={pending}
                onClick={() => pick(w)}
                className={"act " + (weeks === w ? "act-accent ring-1 ring-accent-soft" : "")}
              >
                {w} uker
              </button>
            ))}
            <span className="inline-flex items-center gap-1">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 2))}
                inputMode="numeric"
                placeholder="Antall"
                aria-label="Antall uker"
                className="w-16 rounded-md border border-line-2 bg-canvas px-2 py-1.5 text-sm text-fg"
              />
              <button
                type="button"
                className="act"
                disabled={pending || !custom}
                onClick={() => pick(Number(custom))}
              >
                uker
              </button>
            </span>
          </div>

          {pending && !opts && <p className="text-sm text-muted">Sjekker ledige tider …</p>}

          {opts && (
            <div className="rounded-md bg-surface p-3">
              <p className="text-sm text-fg">
                <span className="font-semibold">{prettyDate(opts.date)}</span> · {opts.service} hos{" "}
                {opts.barber}
              </p>
              {opts.sameTimeFree ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted">Samme tid er ledig:</span>
                  <button
                    type="button"
                    className="act act-accent"
                    disabled={pending}
                    onClick={() => book(opts.wantedTime)}
                  >
                    {pending ? "Booker …" : `Book kl. ${opts.wantedTime}`}
                  </button>
                </div>
              ) : opts.alternatives.length > 0 ? (
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-muted">
                    Kl. {opts.wantedTime} er ikke ledig. Nærmeste ledige tider:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {opts.alternatives.map((t) => (
                      <button key={t} type="button" className="act" disabled={pending} onClick={() => book(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Ingen ledige tider hos {opts.barber} denne dagen. Prøv en annen uke.
                </p>
              )}
            </div>
          )}

          {err && <p className="text-sm text-danger">{err}</p>}

          <button type="button" className="act" onClick={onClose}>
            Nei takk, ferdig
          </button>
        </div>
      )}
    </div>
  );
}
