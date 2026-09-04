"use client";

import { useRouter } from "next/navigation";
import type { AgendaBooking, ShopBarber, ShopService } from "@/lib/shop-queries";
import { DeskBooking } from "@/components/kasse/DeskBooking";

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

const statusStyle: Record<string, string> = {
  confirmed: "border-l-accent-soft",
  pending: "border-l-accent-soft",
  completed: "border-l-accent-soft opacity-70",
  no_show: "border-l-danger opacity-60",
  cancelled: "border-l-danger opacity-50 line-through",
};

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

  function go(days: number) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    router.push(`/kasse/kalender?date=${d.toISOString().slice(0, 10)}`);
  }

  const active = agenda.filter((b) => b.status !== "cancelled");
  const byBarber = new Map<string, AgendaBooking[]>();
  for (const b of barbers) byBarber.set(b.full_name, []);
  for (const b of active) {
    const key = b.barber ?? "Uten barber";
    if (!byBarber.has(key)) byBarber.set(key, []);
    byBarber.get(key)!.push(b);
  }

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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            className="border border-line px-3 py-2 text-sm text-muted hover:text-fg"
          >
            ←
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) =>
              router.push(`/kasse/kalender?date=${e.target.value}`)
            }
            className="border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none"
          />
          <button
            onClick={() => go(1)}
            className="border border-line px-3 py-2 text-sm text-muted hover:text-fg"
          >
            →
          </button>
          <span className="ml-2 text-sm text-muted capitalize">
            {prettyDate}
          </span>
        </div>
        <DeskBooking services={services} barbers={barbers} label="+ Ny booking" />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from(byBarber.entries()).map(([name, list]) => (
          <div key={name} className="w-60 shrink-0">
            <div className="mb-2 border-b border-line pb-2">
              <p className="font-display text-sm font-bold text-fg">{name}</p>
              <p className="text-xs text-muted">{list.length} timer</p>
            </div>
            <div className="space-y-2">
              {list.length === 0 && (
                <p className="py-4 text-center text-xs text-muted">
                  Ingen timer
                </p>
              )}
              {list.map((b) => (
                <div
                  key={b.id}
                  className={
                    "border border-line border-l-4 bg-surface p-2.5 " +
                    (statusStyle[b.status] ?? "border-l-line")
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-sm font-bold text-fg">
                      {hhmm(b.start_at)}
                    </span>
                    <span className="text-[10px] text-muted">
                      {hhmm(b.end_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-fg">{b.customer ?? "—"}</p>
                  <p className="text-xs text-muted">{b.service ?? "—"}</p>
                  {b.status !== "completed" && (
                    <div className="mt-2">
                      <DeskBooking
                        services={services}
                        barbers={barbers}
                        label="Flytt"
                        variant="small"
                        mode="reschedule"
                        bookingId={b.id}
                        prefill={{
                          customerName: b.customer ?? "",
                          service: b.service ?? undefined,
                          barber: b.barber ?? undefined,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
