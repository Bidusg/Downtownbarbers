"use client";

import { useTransition } from "react";
import type { TodayBooking } from "@/lib/dashboard-queries";
import { completeBooking, markNoShow } from "@/app/kasse/actions";

export function ShopBookingList({ bookings }: { bookings: TodayBooking[] }) {
  const [pending, start] = useTransition();

  if (bookings.length === 0) {
    return <p className="py-4 text-sm text-muted">Ingen timer i dag.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {bookings.map((b) => {
        const done = b.status === "completed";
        const noshow = b.status === "no_show";
        return (
          <li key={b.id} className="flex items-center gap-3 py-3">
            <span className="w-12 font-display text-sm font-bold text-accent-soft">
              {b.time}
            </span>
            <span className="flex-1">
              <span className="block text-sm text-fg">{b.customer}</span>
              <span className="block text-xs text-muted">
                {b.service} · {b.barber}
              </span>
            </span>
            {done ? (
              <span className="rounded-full bg-accent-soft/15 px-2.5 py-0.5 text-xs font-semibold text-accent-soft">
                Fullført
              </span>
            ) : noshow ? (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
                Ikke møtt
              </span>
            ) : (
              <span className="flex gap-2">
                <button
                  onClick={() => start(() => completeBooking(b.id))}
                  disabled={pending}
                  className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  Fullfør
                </button>
                <button
                  onClick={() => start(() => markNoShow(b.id))}
                  disabled={pending}
                  className="border border-line-2 px-3 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
                >
                  Ikke møtt
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
