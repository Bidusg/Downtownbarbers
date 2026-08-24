"use client";

import { useState, useTransition } from "react";
import type { AdminBooking } from "@/lib/admin-queries";
import {
  setBookingStatus,
  type BookingStatus,
} from "@/app/admin/bookinger/actions";

const statusLabel: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avbestilt",
  no_show: "Ikke møtt",
};

const statusStyle: Record<string, string> = {
  confirmed: "bg-accent-soft/15 text-accent-soft",
  completed: "bg-accent-soft/15 text-accent-soft",
  cancelled: "bg-surface-2 text-danger",
  pending: "bg-surface-2 text-muted",
  no_show: "bg-surface-2 text-danger",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Row({ b }: { b: AdminBooking }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const act = (status: BookingStatus) => {
    setOpen(false);
    start(() => setBookingStatus(b.id, status));
  };

  return (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3 text-fg">{fmt(b.start_at)}</td>
      <td className="px-4 py-3">
        <span className="text-fg">{b.customer}</span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {b.customerPhone && (
            <a
              href={`tel:${b.customerPhone}`}
              className="text-accent-soft hover:underline"
            >
              {b.customerPhone}
            </a>
          )}
          {b.customerEmail && (
            <a
              href={`mailto:${b.customerEmail}`}
              className="text-muted hover:text-fg hover:underline"
            >
              {b.customerEmail}
            </a>
          )}
        </span>
      </td>
      <td className="px-4 py-3 text-muted">{b.service}</td>
      <td className="px-4 py-3 text-muted">{b.barber}</td>
      <td className="px-4 py-3 font-display">{b.price_nok} kr</td>
      <td className="px-4 py-3">
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
            (statusStyle[b.status] ?? "bg-surface-2 text-muted")
          }
        >
          {statusLabel[b.status] ?? b.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="relative inline-block">
          <button
            onClick={() => setOpen((o) => !o)}
            disabled={pending}
            className="border border-line-2 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-40"
          >
            {pending ? "…" : "Endre status"}
          </button>
          {open && (
            <div className="absolute right-0 z-10 mt-1 w-40 border border-line bg-surface py-1 shadow-lg">
              <button
                onClick={() => act("completed")}
                className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                ✓ Fullført
              </button>
              <button
                onClick={() => act("confirmed")}
                className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                Bekreftet
              </button>
              <button
                onClick={() => act("no_show")}
                className="block w-full px-3 py-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                Ikke møtt
              </button>
              <button
                onClick={() => act("cancelled")}
                className="block w-full px-3 py-2 text-left text-xs text-danger hover:bg-surface-2"
              >
                Avbestill
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export function BookingManager({ bookings }: { bookings: AdminBooking[] }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
          <tr>
            <th className="px-4 py-3">Tidspunkt</th>
            <th className="px-4 py-3">Kunde</th>
            <th className="px-4 py-3">Tjeneste</th>
            <th className="px-4 py-3">Barber</th>
            <th className="px-4 py-3">Pris</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted">
                Ingen bookinger enda. De dukker opp her når kunder bestiller time.
              </td>
            </tr>
          )}
          {bookings.map((b) => (
            <Row key={b.id} b={b} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
