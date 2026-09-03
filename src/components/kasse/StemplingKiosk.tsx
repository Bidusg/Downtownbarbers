"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  verifyPin,
  punch,
  type ClockStaff,
  type ShiftStatus,
} from "@/app/kasse/stempling/actions";

type BoardStaff = ClockStaff & { status: ShiftStatus; workedMinutes: number };

const statusMeta: Record<ShiftStatus, { label: string; dot: string; text: string }> = {
  on: { label: "På vakt", dot: "bg-green-500", text: "text-green-600" },
  paused: { label: "Pause", dot: "bg-amber-500", text: "text-amber-600" },
  off: { label: "Ikke stemplet", dot: "bg-line-2", text: "text-muted" },
};

function hhmm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}t ${m}m` : `${m}m`;
}

export function StemplingKiosk({ staff }: { staff: BoardStaff[] }) {
  const router = useRouter();
  const [active, setActive] = useState<BoardStaff | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {staff.length === 0 && (
          <p className="col-span-full py-12 text-center text-muted">
            Ingen aktive ansatte. Legg til ansatte i admin.
          </p>
        )}
        {staff.map((s) => {
          const m = statusMeta[s.status];
          return (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              className="flex flex-col items-center gap-3 border border-line bg-surface p-6 text-center transition-colors hover:border-accent-soft"
            >
              <span className="flex h-20 w-20 items-center justify-center bg-surface-2 font-display text-3xl font-bold text-fg">
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.photo_url}
                    alt={s.full_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  s.full_name.charAt(0)
                )}
              </span>
              <span className="font-medium text-fg">{s.full_name}</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className={"h-2 w-2 rounded-full " + m.dot} />
                <span className={m.text}>{m.label}</span>
                {s.status !== "off" && (
                  <span className="text-muted">· {hhmm(s.workedMinutes)}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <PinPanel
          staff={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function PinPanel({
  staff,
  onClose,
  onDone,
}: {
  staff: BoardStaff;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<ShiftStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  function press(d: string) {
    setError(null);
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      start(async () => {
        const res = await verifyPin(staff.id, next);
        if (res.ok) setStatus(res.status);
        else {
          setError(res.error);
          setPin("");
        }
      });
    }
  }

  function act(type: "start" | "pause" | "resume" | "end") {
    start(async () => {
      const res = await punch(staff.id, pin, type);
      if (res.ok) {
        const labels: Record<string, string> = {
          on: "På vakt ✓",
          paused: "Pause registrert",
          off: "Vakt avsluttet ✓",
        };
        setDoneMsg(labels[res.status] ?? "Registrert");
        setTimeout(onDone, 1100);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm border border-line bg-canvas p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-xl font-bold text-fg">{staff.full_name}</p>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-fg">
            ×
          </button>
        </div>

        {doneMsg ? (
          <p className="py-10 text-center font-display text-2xl font-bold text-accent-soft">
            {doneMsg}
          </p>
        ) : status === null ? (
          <>
            <p className="mb-3 text-sm text-muted">Skriv inn din 4-sifrede PIN</p>
            <div className="mb-4 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={
                    "h-4 w-4 rounded-full border " +
                    (i < pin.length ? "border-accent-soft bg-accent-soft" : "border-line-2")
                  }
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => press(d)}
                  disabled={pending}
                  className="border border-line-2 bg-surface py-4 font-display text-xl text-fg hover:border-accent-soft disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setPin(pin.slice(0, -1))}
                className="border border-line-2 bg-surface py-4 text-sm text-muted hover:text-fg"
              >
                ←
              </button>
              <button
                onClick={() => press("0")}
                disabled={pending}
                className="border border-line-2 bg-surface py-4 font-display text-xl text-fg hover:border-accent-soft disabled:opacity-40"
              >
                0
              </button>
              <span />
            </div>
            {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
          </>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-center gap-2 text-sm">
              <span className={"h-2.5 w-2.5 rounded-full " + statusMeta[status].dot} />
              <span className={statusMeta[status].text}>
                {statusMeta[status].label}
              </span>
            </div>
            <div className="grid gap-3">
              {status === "off" && (
                <ActionBtn label="Start vakt" onClick={() => act("start")} pending={pending} primary />
              )}
              {status === "on" && (
                <>
                  <ActionBtn label="Pause" onClick={() => act("pause")} pending={pending} />
                  <ActionBtn label="Avslutt vakt" onClick={() => act("end")} pending={pending} danger />
                </>
              )}
              {status === "paused" && (
                <>
                  <ActionBtn label="Fortsett vakt" onClick={() => act("resume")} pending={pending} primary />
                  <ActionBtn label="Avslutt vakt" onClick={() => act("end")} pending={pending} danger />
                </>
              )}
            </div>
            {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  pending,
  primary,
  danger,
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const cls = primary
    ? "bg-accent text-accent-fg hover:bg-accent-hover"
    : danger
      ? "border border-danger/40 text-danger hover:bg-danger/5"
      : "border border-line-2 text-fg hover:border-accent-soft";
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={"py-4 text-center font-semibold transition-colors disabled:opacity-40 " + cls}
    >
      {pending ? "…" : label}
    </button>
  );
}
