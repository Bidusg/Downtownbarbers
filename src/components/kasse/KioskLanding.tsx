"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  verifyPin,
  punch,
  type ClockStaff,
  type ShiftStatus,
} from "@/app/kasse/stempling/actions";
import { getStaffWeek, type KioskDay } from "@/app/kasse/kiosk-actions";
import { EmptyState } from "@/components/ui/EmptyState";

type BoardStaff = ClockStaff & { status: ShiftStatus; workedMinutes: number };

const IDLE_MS = 90_000;

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

export function KioskLanding({ staff }: { staff: BoardStaff[] }) {
  const router = useRouter();
  const [pinFor, setPinFor] = useState<BoardStaff | null>(null);
  const [active, setActive] = useState<{
    staff: BoardStaff;
    pin: string;
    status: ShiftStatus;
  } | null>(null);
  const [week, setWeek] = useState<KioskDay[] | null>(null);

  // Hold navnebrettet ferskt når ingen er «inne» (delt kiosk).
  useEffect(() => {
    if (active || pinFor) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [active, pinFor, router]);

  const backToPicker = useCallback(() => {
    setActive(null);
    setWeek(null);
    setPinFor(null);
    router.refresh();
  }, [router]);

  // 90 sek auto-lås: tilbake til navnevalg ved inaktivitet mens en ansatt er inne.
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!active) return;
    const reset = () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      idleRef.current = setTimeout(backToPicker, IDLE_MS);
    };
    reset();
    const evts = ["pointerdown", "keydown", "scroll"] as const;
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, backToPicker]);

  async function onPinOk(s: BoardStaff, pin: string, status: ShiftStatus) {
    setActive({ staff: s, pin, status });
    setPinFor(null);
    setWeek(null);
    const w = await getStaffWeek(s.id);
    setWeek(w);
  }

  if (active) {
    return (
      <StaffPanel
        staff={active.staff}
        pin={active.pin}
        status={active.status}
        week={week}
        onStatus={(st) => setActive((a) => (a ? { ...a, status: st } : a))}
        onBack={backToPicker}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg">Hvem er du?</h1>
        <p className="mt-1 text-sm text-muted">
          Velg Kasse for front desk, eller navnet ditt for din kalender og
          stempling.
        </p>
      </div>

      {/* Kasse / front desk – ingen kode. */}
      <Link
        href="/kasse/kalender"
        className="flex items-center justify-between rounded-2xl border border-line bg-accent px-6 py-6 text-accent-fg transition-opacity hover:opacity-90 active:opacity-80"
      >
        <span>
          <span className="block font-display text-xl font-bold">Kasse / front desk</span>
          <span className="mt-0.5 block text-sm opacity-80">
            Dagens bookinger, ny booking og hurtigsalg – uten kode
          </span>
        </span>
        <span className="text-2xl">→</span>
      </Link>

      <div>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
          Ansatte
        </p>
        {staff.length === 0 ? (
          <EmptyState
            title="Ingen aktive ansatte"
            description="Legg til ansatte i admin."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {staff.map((s) => {
              const m = statusMeta[s.status];
              return (
                <button
                  key={s.id}
                  onClick={() => setPinFor(s)}
                  className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-6 text-center transition-colors hover:border-accent-soft active:bg-surface-2"
                >
                  <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-surface-2 font-display text-3xl font-bold text-fg">
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
        )}
      </div>

      {pinFor && (
        <PinModal
          staff={pinFor}
          onClose={() => setPinFor(null)}
          onOk={onPinOk}
        />
      )}
    </div>
  );
}

/* ---------- PIN-tastatur ---------- */
function PinModal({
  staff,
  onClose,
  onOk,
}: {
  staff: BoardStaff;
  onClose: () => void;
  onOk: (s: BoardStaff, pin: string, status: ShiftStatus) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function press(d: string) {
    setError(null);
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      start(async () => {
        const res = await verifyPin(staff.id, next);
        if (res.ok) onOk(staff, next, res.status);
        else {
          setError(res.error);
          setPin("");
        }
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-canvas p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-xl font-bold text-fg">{staff.full_name}</p>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-muted hover:text-fg"
            aria-label="Lukk"
          >
            ×
          </button>
        </div>
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
              className="rounded-xl border border-line-2 bg-surface py-5 font-display text-2xl text-fg hover:border-accent-soft active:bg-surface-2 disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin(pin.slice(0, -1))}
            className="rounded-xl border border-line-2 bg-surface py-5 text-base text-muted hover:text-fg active:bg-surface-2"
          >
            ←
          </button>
          <button
            onClick={() => press("0")}
            disabled={pending}
            className="rounded-xl border border-line-2 bg-surface py-5 font-display text-2xl text-fg hover:border-accent-soft active:bg-surface-2 disabled:opacity-40"
          >
            0
          </button>
          <span />
        </div>
        {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}

/* ---------- Ansatt-panel: stempling + 7-dagers oversikt ---------- */
function StaffPanel({
  staff,
  pin,
  status,
  week,
  onStatus,
  onBack,
}: {
  staff: BoardStaff;
  pin: string;
  status: ShiftStatus;
  week: KioskDay[] | null;
  onStatus: (s: ShiftStatus) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = statusMeta[status];

  function act(type: "start" | "pause" | "resume" | "end") {
    setError(null);
    start(async () => {
      const res = await punch(staff.id, pin, type);
      if (res.ok) {
        onStatus(res.status);
        setMsg(
          res.status === "on"
            ? "På vakt ✓"
            : res.status === "paused"
              ? "Pause registrert"
              : "Vakt avsluttet ✓",
        );
        setTimeout(() => setMsg(null), 2000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-surface-2 font-display text-xl font-bold text-fg">
            {staff.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={staff.photo_url} alt={staff.full_name} className="h-full w-full object-cover" />
            ) : (
              staff.full_name.charAt(0)
            )}
          </span>
          <div>
            <p className="font-display text-xl font-bold text-fg">{staff.full_name}</p>
            <p className="flex items-center gap-1.5 text-xs">
              <span className={"h-2 w-2 rounded-full " + m.dot} />
              <span className={m.text}>{m.label}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="rounded-md border border-line-2 px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
        >
          Bytt bruker
        </button>
      </div>

      {/* Stemple – store trykkflater */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
          Stempling
        </p>
        <div className="grid grid-cols-2 gap-3">
          {status === "off" && (
            <ClockBtn label="Start vakt" onClick={() => act("start")} pending={pending} primary wide />
          )}
          {status === "on" && (
            <>
              <ClockBtn label="Pause" onClick={() => act("pause")} pending={pending} />
              <ClockBtn label="Avslutt vakt" onClick={() => act("end")} pending={pending} danger />
            </>
          )}
          {status === "paused" && (
            <>
              <ClockBtn label="Fortsett vakt" onClick={() => act("resume")} pending={pending} primary />
              <ClockBtn label="Avslutt vakt" onClick={() => act("end")} pending={pending} danger />
            </>
          )}
        </div>
        {msg && <p className="mt-3 text-sm font-semibold text-accent-soft">{msg}</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {/* 7-dagers oversikt: dato loddrett i rader, bookinger vannrett utover */}
      <div>
        <p className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">
          Mine bookinger – 7 dager
        </p>
        {week === null ? (
          <p className="py-8 text-center text-sm text-muted">Henter …</p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line">
            {week.map((day) => (
              <div key={day.iso} className="flex items-stretch gap-3 p-3">
                <div
                  className={
                    "flex w-16 shrink-0 flex-col items-center justify-center rounded-lg py-2 " +
                    (day.isToday ? "bg-accent-soft/15" : "bg-surface-2")
                  }
                >
                  <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
                    {day.weekday}
                  </span>
                  <span className="font-display text-lg font-bold text-fg">{day.dayNum}</span>
                  <span className="text-[10px] text-muted">{day.month}</span>
                </div>
                <div className="min-w-0 flex-1 self-center overflow-x-auto">
                  {day.bookings.length === 0 ? (
                    <span className="text-sm text-muted">Ingen bookinger</span>
                  ) : (
                    <div className="flex gap-2">
                      {day.bookings.map((b) => (
                        <div
                          key={b.id}
                          className="w-40 shrink-0 rounded-lg border border-line bg-surface px-3 py-2"
                        >
                          <p className="font-display text-sm font-bold text-fg">{b.time}</p>
                          <p className="truncate text-sm text-fg">{b.customer ?? "—"}</p>
                          {b.service && (
                            <p className="truncate text-xs text-muted">{b.service}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted">
        Skjermen går tilbake til navnevalg automatisk etter litt inaktivitet.
      </p>
    </div>
  );
}

function ClockBtn({
  label,
  onClick,
  pending,
  primary,
  danger,
  wide,
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  primary?: boolean;
  danger?: boolean;
  wide?: boolean;
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
      className={
        "rounded-xl py-4 text-center text-base font-semibold transition-colors disabled:opacity-40 " +
        (wide ? "col-span-2 " : "") +
        cls
      }
    >
      {pending ? "…" : label}
    </button>
  );
}
