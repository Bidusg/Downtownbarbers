"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  upcomingBookingsForStaff,
  moveStaffBookings,
  type UpcomingBooking,
} from "@/app/admin/ansatte/actions";
import { Button } from "@/components/ui/Button";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const osloDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

/**
 * Advarsel før en ansatt deaktiveres (eller får sluttdato) mens det finnes
 * bookede timer framover. Viser kundene, lar admin flytte timene til en annen
 * barber, åpne dem i kalenderen – og først deretter fullføre.
 */
export function UpcomingBookingsDialog({
  staffId,
  staffName,
  initial,
  fromDate,
  others,
  title,
  proceedLabel,
  onProceed,
  onClose,
}: {
  staffId: string;
  staffName: string;
  initial: UpcomingBooking[];
  /** Fra-dato (yyyy-mm-dd) for oppslag på nytt – tom = fra nå. */
  fromDate?: string;
  /** Aktive barbere timene kan flyttes til. */
  others: { id: string; name: string }[];
  title: string;
  /** Tekst på «fullfør»-knappen (f.eks. «Deaktiver»). */
  proceedLabel: string;
  /** Fullfør handlingen. `force` = admin har valgt å fortsette selv om timer gjenstår. */
  onProceed: (force: boolean) => Promise<{ error?: string } | void>;
  onClose: () => void;
}) {
  const [list, setList] = useState<UpcomingBooking[]>(initial);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial.map((b) => b.id)));
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const [pending, start] = useTransition();

  function refresh(after?: string) {
    return upcomingBookingsForStaff(staffId, fromDate).then((r) => {
      const b = r.bookings ?? [];
      setList(b);
      setPicked(new Set(b.map((x) => x.id)));
      if (after) setMsg({ ok: true, text: after });
    });
  }

  function move() {
    if (!target || picked.size === 0) return;
    start(async () => {
      setMsg(null);
      const r = await moveStaffBookings(staffId, target, [...picked]);
      if (r.error) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      const name = others.find((o) => o.id === target)?.name ?? "valgt barber";
      const conflicts = r.conflicts ?? [];
      await refresh(
        `Flyttet ${r.moved ?? 0} ${r.moved === 1 ? "time" : "timer"} til ${name}.` +
          (conflicts.length ? ` Ikke flyttet (opptatt): ${conflicts.join("; ")}.` : ""),
      );
    });
  }

  function proceed(force: boolean) {
    start(async () => {
      setMsg(null);
      const r = await onProceed(force);
      if (r && r.error) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      onClose();
    });
  }

  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upcoming-title"
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col rounded-lg border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-4">
          <h3 id="upcoming-title" className="font-display text-lg font-bold text-fg">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {list.length > 0
              ? `${staffName} har ${list.length} ${list.length === 1 ? "booket time" : "bookede timer"} framover. Flytt timene til en annen barber eller ta kontakt med kundene før du fortsetter.`
              : `${staffName} har ingen bookede timer igjen. Du kan fortsette.`}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {list.length > 0 && (
            <ul className="divide-y divide-line">
              {list.map((b) => (
                <li key={b.id} className="flex items-start gap-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={picked.has(b.id)}
                    onChange={() => toggle(b.id)}
                    aria-label={`Velg timen ${fmt(b.start_at)}`}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg tabular-nums">{fmt(b.start_at)}</p>
                    <p className="text-sm text-fg">
                      {b.customer} <span className="text-muted">· {b.service}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {b.phone ? (
                        <a href={`tel:${b.phone}`} className="hover:text-fg">{b.phone}</a>
                      ) : null}
                      {b.phone && b.email ? " · " : ""}
                      {b.email ? (
                        <a href={`mailto:${b.email}`} className="hover:text-fg">{b.email}</a>
                      ) : null}
                      {!b.phone && !b.email ? "ingen kontaktinfo" : ""}
                    </p>
                  </div>
                  <a
                    href={`/admin/bookinger?date=${osloDate(b.start_at)}`}
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 text-xs font-semibold text-accent-soft hover:underline"
                  >
                    Åpne i kalender
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {msg && (
          <p role="status" className={"px-5 pb-2 text-sm " + (msg.ok ? "text-fg" : "text-danger")}>
            {msg.text}
          </p>
        )}

        <div className="space-y-3 border-t border-line px-5 py-4">
          {list.length > 0 && others.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Flytt valgte ({picked.size}) til</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                aria-label="Barber å flytte til"
                className="h-10 rounded-[10px] border border-line-2 bg-canvas px-2.5 text-sm text-fg"
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <Button variant="subtle" onClick={move} disabled={pending || picked.size === 0} className="px-3 py-2 text-sm">
                {pending ? "Flytter …" : "Flytt"}
              </Button>
              <span className="w-full text-[11px] text-muted">
                Timer der den andre barberen allerede er booket, flyttes ikke. Sjekk at barberen er på jobb
                (turnus), og gi kunden beskjed om bytte.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending} className="px-4 py-2 text-sm">
              Avbryt
            </Button>
            {list.length === 0 ? (
              <Button variant="primary" onClick={() => proceed(false)} disabled={pending} className="px-4 py-2 text-sm">
                {pending ? "Lagrer …" : proceedLabel}
              </Button>
            ) : confirmForce ? (
              <>
                <span className="text-xs text-danger">
                  {list.length} {list.length === 1 ? "time" : "timer"} blir liggende på {staffName}. Sikker?
                </span>
                <button
                  type="button"
                  onClick={() => proceed(true)}
                  disabled={pending}
                  className="act act-solid-danger"
                >
                  Ja, {proceedLabel.toLowerCase()} likevel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmForce(true)} disabled={pending} className="act">
                {proceedLabel} likevel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
