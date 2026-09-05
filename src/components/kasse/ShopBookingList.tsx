"use client";

import { useState, useTransition } from "react";
import type { TodayBooking } from "@/lib/dashboard-queries";
import type { ShopBarber, ShopService } from "@/lib/shop-queries";
import { markNoShow, cancelBooking, sendReceiptForBooking } from "@/app/kasse/actions";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { PaymentControls } from "@/components/kasse/PaymentControls";
import { Avatar } from "@/components/ui/Avatar";

function ReceiptButton({ b }: { b: TodayBooking }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  if (!b.customerEmail) return null;
  return (
    <button
      disabled={pending || sent}
      onClick={() =>
        start(async () => {
          await sendReceiptForBooking(b.id);
          setSent(true);
        })
      }
      className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-50"
    >
      {sent ? "Sendt ✓" : pending ? "…" : "Kvittering"}
    </button>
  );
}

function Row({
  b,
  services,
  barbers,
}: {
  b: TodayBooking;
  services: ShopService[];
  barbers: ShopBarber[];
}) {
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState<null | "pay" | "cancel" | "noshow">(null);
  const [notify, setNotify] = useState(true);

  const done = b.status === "completed";
  const noshow = b.status === "no_show";
  const cancelled = b.status === "cancelled";
  const finished = done || noshow || cancelled;

  const rebook = (
    <DeskBooking
      services={services}
      barbers={barbers}
      label="Book ny time"
      variant="small"
      prefill={{
        customerId: b.customerId ?? undefined,
        customerName: b.customer,
        service: b.service,
        barber: b.barber,
      }}
    />
  );

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="w-11 font-display text-sm font-bold text-accent-soft">
          {b.time}
        </span>
        <Avatar name={b.customer} colorKey={b.customerId ?? undefined} size={30} />
        <span className="flex-1">
          <span className="block text-sm text-fg">{b.customer}</span>
          <span className="block text-xs text-muted">
            {b.service} · {b.barber}
          </span>
        </span>

        {done && (
          <span className="rounded-full bg-accent-soft/15 px-2.5 py-0.5 text-xs font-semibold text-accent-soft">
            Fullført
          </span>
        )}
        {noshow && (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-danger">
            Ikke møtt
          </span>
        )}
        {cancelled && (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-danger">
            Avlyst
          </span>
        )}

        <span className="flex items-center gap-2">
          {finished ? (
            <>
              {done && <ReceiptButton b={b} />}
              {rebook}
            </>
          ) : menu === "noshow" ? (
            <>
              <span className="mr-1 text-xs text-muted">Ikke møtt?</span>
              {b.customerEmail && (
                <label className="mr-1 flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(e) => setNotify(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#F47721]"
                  />
                  Varsle
                </label>
              )}
              <button
                onClick={() =>
                  start(async () => {
                    await markNoShow(b.id, {
                      notify: !!b.customerEmail && notify,
                    });
                  })
                }
                disabled={pending}
                className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs font-semibold text-danger hover:border-danger disabled:opacity-50"
              >
                Ja
              </button>
              <button
                onClick={() => setMenu(null)}
                className="px-2 py-1.5 text-xs text-muted hover:text-fg"
              >
                ✕
              </button>
            </>
          ) : menu === "cancel" ? (
            <>
              <span className="mr-1 text-xs text-muted">Avlyse?</span>
              <button
                onClick={() => start(() => cancelBooking(b.id))}
                disabled={pending}
                className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs font-semibold text-danger hover:border-danger disabled:opacity-50"
              >
                Ja, avlys
              </button>
              <button
                onClick={() => setMenu(null)}
                className="px-2 py-1.5 text-xs text-muted hover:text-fg"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setMenu(menu === "pay" ? null : "pay")}
                disabled={pending}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Fullfør
              </button>
              <DeskBooking
                services={services}
                barbers={barbers}
                label="Flytt"
                variant="small"
                mode="reschedule"
                bookingId={b.id}
                prefill={{
                  customerName: b.customer,
                  service: b.service,
                  barber: b.barber,
                }}
              />
              <button
                onClick={() => setMenu("noshow")}
                disabled={pending}
                className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
              >
                Ikke møtt
              </button>
              <button
                onClick={() => setMenu("cancel")}
                disabled={pending}
                className="px-2 py-1.5 text-xs text-muted hover:text-danger disabled:opacity-50"
              >
                Avlys
              </button>
            </>
          )}
        </span>
      </div>

      {menu === "pay" && (
        <div className="mt-2 rounded-lg border border-line bg-canvas p-3">
          <PaymentControls
            bookingId={b.id}
            customerName={b.customer}
            customerEmail={b.customerEmail}
            onDone={() => setMenu(null)}
          />
        </div>
      )}
    </li>
  );
}

export function ShopBookingList({
  bookings,
  services,
  barbers,
}: {
  bookings: TodayBooking[];
  services: ShopService[];
  barbers: ShopBarber[];
}) {
  if (bookings.length === 0) {
    return <p className="py-4 text-sm text-muted">Ingen timer i dag.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {bookings.map((b) => (
        <Row key={b.id} b={b} services={services} barbers={barbers} />
      ))}
    </ul>
  );
}
