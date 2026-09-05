"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgendaBooking, ShopBarber, ShopService } from "@/lib/shop-queries";
import { colorAt } from "@/lib/colors";
import { Avatar } from "@/components/ui/Avatar";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { BookingDetailModal } from "@/components/kasse/BookingDetailModal";

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

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DayCalendar({
  date,
  agenda,
  barbers,
  services,
}: {
  date: string;
  agenda: AgendaBooking[];
  barbers: ShopBarber[];
  services: ShopService[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AgendaBooking | null>(null);

  const down = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
  const isToday = date === today;
  const nowMin = osloMinutes(new Date().toISOString());

  // Kolonner: én per barber (rekkefølge = farge-indeks).
  const columns = useMemo(() => {
    const map = new Map<string, { barber: ShopBarber; items: AgendaBooking[] }>();
    barbers.forEach((b) => map.set(b.full_name, { barber: b, items: [] }));
    for (const a of agenda) {
      if (a.status === "cancelled") continue;
      const key = a.barber ?? "Uten barber";
      if (!map.has(key))
        map.set(key, {
          barber: { id: key, full_name: key },
          items: [],
        });
      map.get(key)!.items.push(a);
    }
    return Array.from(map.values());
  }, [agenda, barbers]);

  const colorFor = (name: string) => {
    const i = barbers.findIndex((b) => b.full_name === name);
    return colorAt(i >= 0 ? i : columns.findIndex((c) => c.barber.full_name === name));
  };

  const hours: number[] = [];
  for (let h = 9; h <= 21; h++) hours.push(h);

  const prettyDate = (() => {
    try {
      return new Date(date + "T00:00:00").toLocaleDateString("nb-NO", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      });
    } catch {
      return date;
    }
  })();

  function onDown(e: React.PointerEvent) {
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
    if (!down.current) return;
    const dx = e.clientX - down.current.x;
    const dy = e.clientY - down.current.y;
    down.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      router.push(`/kasse/kalender?date=${addDays(date, dx > 0 ? -1 : 1)}`);
    }
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
            onChange={(e) =>
              router.push(`/kasse/kalender?date=${e.target.value}`)
            }
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-muted focus:border-accent-soft focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">
            ← sveip for å bytte dag →
          </span>
          <DeskBooking services={services} barbers={barbers} label="+ Ny booking" />
        </div>
      </div>

      {/* Rutenett */}
      <div
        className="relative overflow-auto rounded-xl border border-line bg-surface"
        style={{ maxHeight: "72vh", touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <div className="flex min-w-max">
          {/* Tidsakse */}
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

          {/* Barber-kolonner */}
          {columns.map((col) => {
            const color = colorFor(col.barber.full_name);
            return (
              <div
                key={col.barber.id}
                className="w-44 shrink-0 border-l border-line"
              >
                <div
                  className="sticky top-0 z-10 flex items-center gap-2 border-b border-line px-3"
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
                  {/* timelinjer */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute right-0 left-0 border-t border-line/40"
                      style={{ top: (h * 60 - OPEN) * PX }}
                    />
                  ))}

                  {/* nå-linje */}
                  {isToday && nowMin >= OPEN && nowMin <= CLOSE && (
                    <div
                      className="absolute right-0 left-0 z-[5] border-t-2 border-accent"
                      style={{ top: (nowMin - OPEN) * PX }}
                    >
                      <span className="absolute -top-1 left-0 h-2 w-2 rounded-full bg-accent" />
                    </div>
                  )}

                  {/* bookinger */}
                  {col.items.map((b) => {
                    const s = Math.max(osloMinutes(b.start_at), OPEN);
                    const e = Math.min(osloMinutes(b.end_at), CLOSE);
                    const top = (s - OPEN) * PX;
                    const height = Math.max((e - s) * PX, 26);
                    const completed = b.status === "completed";
                    const noshow = b.status === "no_show";
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          if (moved.current) return;
                          setSelected(b);
                        }}
                        className="absolute right-1 left-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left transition-transform hover:z-10 hover:scale-[1.02]"
                        style={{
                          top,
                          height,
                          background: color + "26",
                          borderLeftColor: color,
                          opacity: completed || noshow ? 0.6 : 1,
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Avatar
                            name={b.customer ?? "?"}
                            colorKey={b.customer_id ?? undefined}
                            size={16}
                          />
                          <span className="truncate text-xs font-semibold text-fg">
                            {hhmm(b.start_at)} {b.customer ?? "—"}
                          </span>
                        </div>
                        {height > 38 && (
                          <p className="truncate text-[10px] text-muted">
                            {completed ? "✓ " : noshow ? "✗ " : ""}
                            {b.service ?? ""}
                          </p>
                        )}
                      </button>
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
    </div>
  );
}
