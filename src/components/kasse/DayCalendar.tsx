"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { AgendaBooking, ShopBarber, ShopService } from "@/lib/shop-queries";
import { colorAt } from "@/lib/colors";
import { Avatar } from "@/components/ui/Avatar";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { QuickSale } from "@/components/kasse/QuickSale";
import { BookingDetailModal } from "@/components/kasse/BookingDetailModal";
import {
  blockTime,
  cancelBooking,
  reassignBookingBarber,
  rescheduleBooking,
  setBookingLength,
} from "@/app/kasse/actions";

const OPEN = 9 * 60; // 09:00
const CLOSE = 21 * 60; // 21:00
const SPAN = CLOSE - OPEN;
const PX = 1.3; // piksler per minutt
const HEADER_H = 44;

function osloMinutes(iso: string): number {
  try {
    const s = new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  } catch {
    return OPEN;
  }
}

function hhmm(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Minutter etter midnatt → "HH:MM" (brukes til live-feedback når man drar).
function minToHHMM(min: number) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(Math.round(min) % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// En blokk/pause er en booking uten kunde og uten tjeneste.
const isBlock = (b: AgendaBooking) => !b.customer && !b.service;

export function DayCalendar({
  date,
  agenda,
  barbers,
  services,
  basePath = "/kasse/kalender",
  canBlock = false,
  canResize = false,
  onDuty,
}: {
  date: string;
  agenda: AgendaBooking[];
  barbers: ShopBarber[];
  services: ShopService[];
  basePath?: string;
  canBlock?: boolean;
  canResize?: boolean;
  /** Navn på barbere som er på vakt denne dagen. Uten = alle aktive vises. */
  onDuty?: string[] | null;
}) {
  const router = useRouter();

  // ---- Sveip mellom dager (touch) med «bounce» -------------------------------
  // dragX: live forskyvning mens fingeren er på skjermen (gummistrikk).
  // slide: utgående/innkommende animasjon rundt dagsbyttet.
  const [dragX, setDragX] = useState(0);
  const [slide, setSlide] = useState<{ dir: 1 | -1; phase: "out" | "in" } | null>(null);
  const touch = useRef<{ x: number; y: number; axis: "x" | "y" | null; fired: boolean } | null>(null);
  const prevDate = useRef(date);
  useEffect(() => {
    // Ny dag kom fra serveren → la den gli inn fra motsatt side og «sprette» på plass.
    if (prevDate.current !== date) {
      prevDate.current = date;
      setSlide((s) => (s && s.phase === "out" ? { dir: s.dir, phase: "in" } : null));
      setDragX(0);
      const t = setTimeout(() => setSlide(null), 420);
      return () => clearTimeout(t);
    }
  }, [date]);
  function goDay(dir: 1 | -1) {
    if (slide) return; // én dag per sveip
    setSlide({ dir, phase: "out" });
    setDragX(0);
    setTimeout(() => router.push(`${basePath}?date=${addDays(date, dir)}`), 180);
    // Sikkerhetsnett: hvis ny dag aldri kommer (f.eks. nettfeil), slipp animasjonen.
    setTimeout(() => setSlide((s) => (s && s.phase === "out" ? null : s)), 2500);
  }
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1 || slide) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, fired: false };
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = touch.current;
    if (!t || t.fired || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (!t.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      t.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
    }
    if (t.axis !== "x") return;
    // Gummistrikk: følger fingeren, men dempet.
    setDragX(Math.max(-140, Math.min(140, dx * 0.45)));
  }
  function onTouchEnd(e: React.TouchEvent) {
    const t = touch.current;
    touch.current = null;
    if (!t || t.axis !== "x") {
      setDragX(0);
      return;
    }
    const dx = e.changedTouches[0].clientX - t.x;
    if (Math.abs(dx) > 70) {
      t.fired = true;
      goDay(dx > 0 ? -1 : 1); // sveip mot høyre = forrige dag
    } else {
      setDragX(0); // spretter tilbake
    }
  }
  const slideStyle: React.CSSProperties = slide
    ? slide.phase === "out"
      ? {
          transform: `translateX(${slide.dir === 1 ? "-110%" : "110%"})`,
          opacity: 0,
          transition: "transform 180ms ease-in, opacity 180ms ease-in",
        }
      : {
          transform: "translateX(0)",
          opacity: 1,
          transition: "transform 420ms cubic-bezier(.22,1.35,.36,1), opacity 200ms ease-out",
        }
    : {
        transform: `translateX(${dragX}px)`,
        transition: dragX === 0 ? "transform 320ms cubic-bezier(.22,1.4,.36,1)" : "none",
      };
  const [selected, setSelected] = useState<AgendaBooking | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [, startCancel] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  // Dra-for-lengde: aktiv resize + live sluttid (minutter etter midnatt, Oslo).
  const [resize, setResize] = useState<{
    id: string;
    startMin: number;
    endMin: number;
    y0: number;
  } | null>(null);
  const [resizeEnd, setResizeEnd] = useState<number | null>(null);
  const [resizeMsg, setResizeMsg] = useState<string | null>(null);
  const [, startResizeSave] = useTransition();
  const [transfer, setTransfer] = useState<{
    booking: AgendaBooking;
    toBarber: string;
  } | null>(null);

  // Dra-for-flytting (vertikalt = ny starttid, samme barber/kolonne).
  const [move, setMove] = useState<{
    id: string;
    startMin: number; // opprinnelig start (minutter etter midnatt, Oslo)
    dur: number; // varighet i minutter (beholdes)
    y0: number; // clientY ved pointer-down
  } | null>(null);
  const [moveStart, setMoveStart] = useState<number | null>(null); // live ny start
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  const [, startMoveSave] = useTransition();
  // Optimistisk ny start per booking-id – holdes til router.refresh() gir ny agenda.
  const [optimistic, setOptimistic] = useState<Record<string, number>>({});
  // Fersk agenda fra serveren → nullstill optimistiske overstyringer.
  useEffect(() => {
    setOptimistic({});
  }, [agenda]);

  const down = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  // Pointer-gest på en blokk: hvilken booking, startpunkt og valgt akse.
  const blkDown = useRef<{
    id: string;
    x: number;
    y: number;
    axis: "" | "v" | "h";
  } | null>(null);
  // Satt når en vertikal flytting faktisk endret tiden – hindrer at klikk åpner modal.
  const blkDragged = useRef(false);

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
  const isToday = date === today;
  const nowMin = osloMinutes(new Date().toISOString());

  const columns = useMemo(() => {
    const map = new Map<string, { barber: ShopBarber; items: AgendaBooking[] }>();
    // Kun barbere på vakt får kolonne (pluss alle som faktisk har bookinger).
    const duty = onDuty && onDuty.length > 0 ? new Set(onDuty) : null;
    barbers
      .filter((b) => !duty || duty.has(b.full_name))
      .forEach((b) => map.set(b.full_name, { barber: b, items: [] }));
    for (const a of agenda) {
      if (a.status === "cancelled") continue;
      const key = a.barber ?? "Uten barber";
      if (!map.has(key))
        map.set(key, { barber: { id: key, full_name: key }, items: [] });
      map.get(key)!.items.push(a);
    }
    return Array.from(map.values());
  }, [agenda, barbers, onDuty]);

  const colorFor = (name: string) => {
    const i = barbers.findIndex((b) => b.full_name === name);
    return colorAt(i >= 0 ? i : columns.findIndex((c) => c.barber.full_name === name));
  };

  const hours: number[] = [];
  for (let h = 9; h <= 21; h++) hours.push(h);

  const prettyDate = (() => {
    try {
      const s = new Date(date + "T00:00:00").toLocaleDateString("nb-NO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      return s.charAt(0).toUpperCase() + s.slice(1);
    } catch {
      return date;
    }
  })();

  function onDown(e: React.PointerEvent) {
    if (e.pointerType === "touch") return; // touch-sveip håndteres av onTouch*
    down.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  }
  function onMove(e: React.PointerEvent) {
    if (!down.current) return;
    if (
      Math.abs(e.clientX - down.current.x) > 10 ||
      Math.abs(e.clientY - down.current.y) > 10
    )
      moved.current = true;
  }
  function onUp(e: React.PointerEvent) {
    if (dragId) {
      down.current = null;
      return;
    }
    if (!down.current) return;
    const dx = e.clientX - down.current.x;
    const dy = e.clientY - down.current.y;
    down.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      goDay(dx > 0 ? -1 : 1);
    }
  }

  function removeBlock(id: string) {
    startCancel(async () => {
      await cancelBooking(id);
      router.refresh();
    });
  }

  // ---- Dra-for-lengde -------------------------------------------------
  const SNAP = 5; // minutter
  function beginResize(e: React.PointerEvent, b: AgendaBooking) {
    e.preventDefault();
    e.stopPropagation();
    setResizeMsg(null);
    const startMin = osloMinutes(b.start_at);
    const endMin = osloMinutes(b.end_at);
    setResize({ id: b.id, startMin, endMin, y0: e.clientY });
    setResizeEnd(endMin);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }
  function moveResize(e: React.PointerEvent) {
    if (!resize) return;
    const dy = e.clientY - resize.y0;
    let end = resize.endMin + dy / PX;
    end = Math.round(end / SNAP) * SNAP;
    end = Math.max(resize.startMin + SNAP, Math.min(end, CLOSE));
    setResizeEnd(end);
  }
  function endResize() {
    const cur = resize;
    const newEnd = resizeEnd;
    setResize(null);
    setResizeEnd(null);
    if (!cur || newEnd == null || newEnd === cur.endMin) return;
    const hh = String(Math.floor(newEnd / 60)).padStart(2, "0");
    const mm = String(newEnd % 60).padStart(2, "0");
    const endIso = new Date(`${date}T${hh}:${mm}:00`).toISOString();
    startResizeSave(async () => {
      const res = await setBookingLength(cur.id, endIso);
      if (res.error) setResizeMsg(res.error);
      router.refresh();
    });
  }

  // ---- Dra-for-flytting (vertikal = ny tid) ---------------------------
  const MOVE_THRESH = 5; // piksler før en gest regnes som dra
  const MOVE_SNAP = 15; // minutter (kalenderens steg)

  function blockPointerDown(e: React.PointerEvent, b: AgendaBooking) {
    // Ikke preventDefault her: en horisontal gest skal fortsatt kunne starte
    // native dra-til-barber. Vi avgjør aksen på første reelle bevegelse.
    blkDown.current = { id: b.id, x: e.clientX, y: e.clientY, axis: "" };
    blkDragged.current = false;
  }

  function blockPointerMove(e: React.PointerEvent, b: AgendaBooking) {
    const d = blkDown.current;
    if (!d || d.id !== b.id) return;

    // Aktiv vertikal flytting: følg pekeren, snap til 15 min, hold deg innenfor dagen.
    if (move?.id === b.id) {
      const dy = e.clientY - move.y0;
      let ns = move.startMin + dy / PX;
      ns = Math.round(ns / MOVE_SNAP) * MOVE_SNAP;
      ns = Math.max(OPEN, Math.min(ns, CLOSE - move.dur));
      setMoveStart(ns);
      e.preventDefault();
      return;
    }

    if (d.axis !== "") return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) < MOVE_THRESH && Math.abs(dy) < MOVE_THRESH) return;

    if (Math.abs(dy) >= Math.abs(dx)) {
      // Vertikal → flytt tid (pointer). Samme barber/kolonne.
      d.axis = "v";
      const curStart =
        optimistic[b.id] != null ? optimistic[b.id] : osloMinutes(b.start_at);
      const dur = Math.max(
        MOVE_SNAP,
        osloMinutes(b.end_at) - osloMinutes(b.start_at),
      );
      setMove({ id: b.id, startMin: curStart, dur, y0: d.y });
      setMoveStart(curStart);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      e.preventDefault();
    } else {
      // Horisontal → overlat til native dra-til-barber (uendret oppførsel).
      d.axis = "h";
    }
  }

  function blockPointerUp(_e: React.PointerEvent, b: AgendaBooking) {
    if (move?.id === b.id) endMove();
    blkDown.current = null;
  }

  function blockPointerCancel() {
    setMove(null);
    setMoveStart(null);
    blkDown.current = null;
  }

  function endMove() {
    const cur = move;
    const ns = moveStart;
    setMove(null);
    setMoveStart(null);
    if (!cur || ns == null || ns === cur.startMin) return;
    blkDragged.current = true; // ekte flytting – ikke tolk som klikk
    const startIso = new Date(
      `${date}T${minToHHMM(ns)}:00`,
    ).toISOString();
    setMoveMsg(null);
    setOptimistic((m) => ({ ...m, [cur.id]: ns }));
    startMoveSave(async () => {
      const res = await rescheduleBooking(cur.id, startIso);
      if (res.error) {
        // Feil → angre den optimistiske flyttingen og vis melding.
        setOptimistic((m) => {
          const n = { ...m };
          delete n[cur.id];
          return n;
        });
        setMoveMsg(res.error);
      }
      router.refresh();
    });
  }

  return (
    <div>
      {/* Topplinje */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-bold capitalize">
            {prettyDate}
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => router.push(`${basePath}?date=${e.target.value}`)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted focus:border-accent-soft focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">
            ← sveip for å bytte dag →
          </span>
          {canBlock && (
            <button
              onClick={() => setBlockOpen(true)}
              className="rounded-md border border-line-2 px-3 py-2 text-sm font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
            >
              Blokker / pause
            </button>
          )}
          <QuickSale barbers={barbers} />
          <DeskBooking services={services} barbers={barbers} label="+ Ny booking" />
        </div>
      </div>

      {resizeMsg && (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {resizeMsg}
        </p>
      )}

      {moveMsg && (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {moveMsg}
        </p>
      )}

      {/* Rutenett */}
      <div
        className="relative overflow-auto rounded-xl border border-line bg-surface"
        style={{ maxHeight: "72vh", touchAction: "pan-y", ...slideStyle }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touch.current = null;
          setDragX(0);
        }}
      >
        <div className="flex min-w-full">
          <div className="sticky left-0 z-20 w-12 shrink-0 bg-surface">
            <div style={{ height: HEADER_H }} className="border-b border-line" />
            <div className="relative" style={{ height: SPAN * PX }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute -translate-y-1/2 pr-2 text-right text-[10px] text-muted"
                  style={{ top: (h * 60 - OPEN) * PX, right: 0 }}
                >
                  {String(h).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          {columns.map((col) => {
            const color = colorFor(col.barber.full_name);
            return (
              <div
                key={col.barber.id}
                className="min-w-[150px] flex-1 border-l border-line"
                onDragOver={(e) => {
                  if (dragId) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = agenda.find((x) => x.id === dragId);
                  setDragId(null);
                  if (dropped && (dropped.barber ?? "") !== col.barber.full_name) {
                    setTransfer({ booking: dropped, toBarber: col.barber.full_name });
                  }
                }}
              >
                <div
                  className={`sticky top-0 z-10 flex items-center gap-2 border-b border-line px-3 ${
                    dragId ? "outline-dashed outline-1 outline-accent-soft/40" : ""
                  }`}
                  style={{ height: HEADER_H, background: color + "26" }}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="truncate text-sm font-semibold text-fg">
                    {col.barber.full_name}
                  </span>
                </div>

                <div className="relative" style={{ height: SPAN * PX }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute right-0 left-0 border-t border-line/40"
                      style={{ top: (h * 60 - OPEN) * PX }}
                    />
                  ))}

                  {isToday && nowMin >= OPEN && nowMin <= CLOSE && (
                    <div
                      className="absolute right-0 left-0 z-[5] border-t-2 border-accent"
                      style={{ top: (nowMin - OPEN) * PX }}
                    >
                      <span className="absolute -top-1 left-0 h-2 w-2 rounded-full bg-accent" />
                    </div>
                  )}

                  {col.items.map((b) => {
                    const realStart = osloMinutes(b.start_at);
                    const dur = osloMinutes(b.end_at) - realStart;
                    // Effektiv start/slutt: optimistisk flytting < live drag; live
                    // resize overstyrer kun sluttiden.
                    let startMin = realStart;
                    let endMin = osloMinutes(b.end_at);
                    if (optimistic[b.id] != null) {
                      startMin = optimistic[b.id];
                      endMin = startMin + dur;
                    }
                    if (resize?.id === b.id && resizeEnd != null)
                      endMin = resizeEnd;
                    if (move?.id === b.id && moveStart != null) {
                      startMin = moveStart;
                      endMin = moveStart + dur;
                    }
                    const isMoving = move?.id === b.id;
                    const s = Math.max(startMin, OPEN);
                    const e = Math.min(endMin, CLOSE);
                    const top = (s - OPEN) * PX;
                    const height = Math.max((e - s) * PX, 26);

                    // Blokk / pause – egen visning
                    if (isBlock(b)) {
                      return (
                        <div
                          key={b.id}
                          className="group absolute right-1 left-1 overflow-hidden rounded-md border border-dashed border-line-2 px-2 py-1 text-left"
                          style={{
                            top,
                            height,
                            background:
                              "repeating-linear-gradient(45deg, oklch(var(--surface-2)), oklch(var(--surface-2)) 6px, transparent 6px, transparent 12px)",
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate text-[11px] font-semibold text-muted">
                              ⛔ {hhmm(b.start_at)} Blokkert
                            </span>
                            <button
                              onClick={() => removeBlock(b.id)}
                              className="ml-1 shrink-0 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                              aria-label="Fjern blokk"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const completed = b.status === "completed";
                    const noshow = b.status === "no_show";
                    const resizable = canResize && !completed && !noshow;
                    const isResizing = resize?.id === b.id;
                    // Flyttbar = aktiv time (samme vilkår som dra-til-barber).
                    const movable = !completed && !noshow;
                    return (
                      <Fragment key={b.id}>
                        <button
                          onClick={() => {
                            // Et reelt dra (akse eller terskel) skal ikke åpne modalen.
                            if (
                              moved.current ||
                              isResizing ||
                              isMoving ||
                              blkDragged.current
                            ) {
                              blkDragged.current = false;
                              return;
                            }
                            setSelected(b);
                          }}
                          draggable={movable && !isResizing && !isMoving}
                          onDragStart={(e) => {
                            // Pågående vertikal flytting → avbryt native dra-til-barber.
                            if (isMoving || blkDown.current?.axis === "v") {
                              e.preventDefault();
                              return;
                            }
                            e.stopPropagation();
                            setDragId(b.id);
                            e.dataTransfer.effectAllowed = "move";
                            try {
                              e.dataTransfer.setData("text/plain", b.id);
                            } catch {
                              /* noop */
                            }
                          }}
                          onDragEnd={() => setDragId(null)}
                          onPointerDown={
                            movable
                              ? (ev) => blockPointerDown(ev, b)
                              : undefined
                          }
                          onPointerMove={
                            movable
                              ? (ev) => blockPointerMove(ev, b)
                              : undefined
                          }
                          onPointerUp={
                            movable ? (ev) => blockPointerUp(ev, b) : undefined
                          }
                          onPointerCancel={
                            movable ? blockPointerCancel : undefined
                          }
                          title={
                            movable
                              ? "Dra opp/ned for å endre tid · dra til siden for å bytte barber"
                              : undefined
                          }
                          className={`absolute right-1 left-1 cursor-grab overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left motion-safe:transition-transform hover:z-10 motion-safe:hover:scale-[1.02] active:cursor-grabbing ${
                            isMoving
                              ? "z-30 shadow-lg ring-1 ring-accent-soft"
                              : ""
                          }`}
                          style={{
                            top,
                            height,
                            background: color + "26",
                            borderLeftColor: color,
                            opacity:
                              dragId === b.id ? 0.35 : completed || noshow ? 0.6 : 1,
                            touchAction: movable ? "none" : undefined,
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <Avatar
                              name={b.customer ?? "?"}
                              colorKey={b.customer_id ?? undefined}
                              size={16}
                            />
                            <span className="truncate text-xs font-semibold text-fg">
                              {minToHHMM(startMin)} {b.customer ?? "—"}
                            </span>
                            {(b.group_size ?? 1) > 1 && (
                              <span
                                className="shrink-0 text-[10px] text-accent-soft"
                                title={b.person_label ?? "Gruppebooking"}
                                aria-label="Gruppebooking"
                              >
                                👥
                              </span>
                            )}
                            {b.notes && (
                              <span
                                className="shrink-0 text-[10px]"
                                title={b.notes}
                                aria-label="Notat fra kunden"
                              >
                                📝
                              </span>
                            )}
                          </div>
                          {height > 38 && (
                            <p className="truncate text-[10px] text-muted">
                              {completed ? "✓ " : noshow ? "✗ " : ""}
                              {b.service ?? ""}
                              {b.addons && b.addons.length > 0
                                ? ` +${b.addons.length}`
                                : ""}
                            </p>
                          )}
                        </button>

                        {/* Dra-håndtak nederst: endre lengde */}
                        {resizable && (
                          <div
                            onPointerDown={(ev) => beginResize(ev, b)}
                            onPointerMove={moveResize}
                            onPointerUp={endResize}
                            title="Dra for å endre lengde"
                            aria-label="Endre lengde"
                            className="absolute right-1 left-1 z-20 flex h-3 cursor-ns-resize items-center justify-center rounded-b-md"
                            style={{
                              top: top + height - 7,
                              background: color + "55",
                              touchAction: "none",
                            }}
                          >
                            <span className="h-0.5 w-6 rounded-full bg-fg/50" />
                          </div>
                        )}

                        {/* Live sluttid mens man drar */}
                        {isResizing && resizeEnd != null && (
                          <div
                            className="pointer-events-none absolute right-1 z-30 rounded bg-fg px-1.5 py-0.5 text-[10px] font-bold text-surface tabular-nums"
                            style={{ top: top + height + 2 }}
                          >
                            {String(Math.floor(resizeEnd / 60)).padStart(2, "0")}:
                            {String(resizeEnd % 60).padStart(2, "0")}
                          </div>
                        )}

                        {/* Live ny starttid mens man flytter */}
                        {isMoving && moveStart != null && (
                          <div
                            className="pointer-events-none absolute left-1 z-40 rounded bg-fg px-1.5 py-0.5 text-[10px] font-bold text-surface tabular-nums"
                            style={{ top: Math.max(top - 16, 0) }}
                          >
                            {minToHHMM(moveStart)}–{minToHHMM(moveStart + dur)}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <BookingDetailModal
          booking={selected}
          services={services}
          barbers={barbers}
          barberColor={colorFor(selected.barber ?? "")}
          onClose={() => setSelected(null)}
        />
      )}

      {blockOpen && (
        <BlockDialog
          date={date}
          barbers={barbers}
          onClose={() => setBlockOpen(false)}
          onDone={() => {
            setBlockOpen(false);
            router.refresh();
          }}
        />
      )}

      {transfer && (
        <TransferDialog
          booking={transfer.booking}
          toBarber={transfer.toBarber}
          onClose={() => setTransfer(null)}
          onDone={() => {
            setTransfer(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function BlockDialog({
  date,
  barbers,
  onClose,
  onDone,
}: {
  date: string;
  barbers: ShopBarber[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [barber, setBarber] = useState(barbers[0]?.full_name ?? "");
  const [d, setD] = useState(date);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("12:30");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    const startIso = new Date(`${d}T${from}:00`).toISOString();
    const endIso = new Date(`${d}T${to}:00`).toISOString();
    start(async () => {
      const res = await blockTime(barber, startIso, endIso, reason);
      if (res.error) setError(res.error);
      else onDone();
    });
  }

  const field =
    "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Blokker tid / pause</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Lukk">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-xs text-muted">Barber</label>
        <select value={barber} onChange={(e) => setBarber(e.target.value)} className={`${field} mb-3`}>
          {barbers.map((b) => (
            <option key={b.id} value={b.full_name}>
              {b.full_name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs text-muted">Dato</label>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={`${field} mb-3`} />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Fra</label>
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Til</label>
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </div>
        </div>

        <label className="mb-1 block text-xs text-muted">Årsak (valgfritt)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lunsj, møte, privat …"
          className={`${field} mb-4`}
        />

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-fg">
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={pending || !barber}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "…" : "Blokker"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferDialog({
  booking,
  toBarber,
  onClose,
  onDone,
}: {
  booking: AgendaBooking;
  toBarber: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fromBarber = booking.barber ?? "Opprinnelig barber";

  function submit() {
    setError(null);
    start(async () => {
      const res = await reassignBookingBarber(booking.id, toBarber, pin.trim());
      if (res.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Flytt til {toBarber}?</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Lukk">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          {booking.customer ?? "Kunden"} er booket hos{" "}
          <b className="text-fg">{fromBarber}</b>. For å flytte til{" "}
          <b className="text-fg">{toBarber}</b> må {fromBarber} godkjenne med sin PIN.
        </p>
        <label className="mb-1 block text-xs text-muted">PIN til {fromBarber}</label>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pin.length === 4) submit();
          }}
          placeholder="••••"
          className="mb-4 w-full rounded-md border border-line bg-canvas px-3 py-2 text-center text-lg tracking-[0.5em] text-fg focus:border-accent-soft focus:outline-none"
        />
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-fg">
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={pending || pin.length !== 4}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? "…" : "Godkjenn og flytt"}
          </button>
        </div>
      </div>
    </div>
  );
}
