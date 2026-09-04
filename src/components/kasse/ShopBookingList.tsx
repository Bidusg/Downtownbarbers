"use client";

import { useState, useTransition } from "react";
import type { TodayBooking } from "@/lib/dashboard-queries";
import type { ShopBarber, ShopService } from "@/lib/shop-queries";
import {
  completeBooking,
  markNoShow,
  cancelBooking,
  sendReceiptForBooking,
} from "@/app/kasse/actions";
import { DeskBooking } from "@/components/kasse/DeskBooking";

const PAYMENTS = ["Kontant", "Kort", "Vipps"];

const inputCls =
  "w-full border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none";

function PayPanel({ b, onClose }: { b: TodayBooking; onClose: () => void }) {
  const [pending, start] = useTransition();
  const hasEmail = !!b.customerEmail;
  const [showInfo, setShowInfo] = useState(!hasEmail);
  const [name, setName] = useState(
    b.customer && b.customer !== "—" ? b.customer : "",
  );
  const [email, setEmail] = useState(b.customerEmail ?? "");
  const [phone, setPhone] = useState("");
  const [receipt, setReceipt] = useState(hasEmail);

  function pay(method: string) {
    start(async () => {
      await completeBooking(b.id, {
        paymentMethod: method,
        customer: showInfo ? { name, email, phone } : undefined,
        sendReceipt: receipt && !!(email.trim() || b.customerEmail),
      });
      onClose();
    });
  }

  return (
    <div className="mt-2 border border-line bg-canvas p-3">
      {showInfo ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navn"
            className={inputCls}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-post (for kvittering)"
            className={inputCls}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon"
            className={inputCls}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowInfo(true)}
          className="mb-2 block text-xs font-semibold text-accent-soft hover:underline"
        >
          + Rediger kundeinfo
        </button>
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={receipt}
          onChange={(e) => setReceipt(e.target.checked)}
        />
        Send kvittering på e-post
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Betalt med:</span>
        {PAYMENTS.map((p) => (
          <button
            key={p}
            disabled={pending}
            onClick={() => pay(p)}
            className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {p}
          </button>
        ))}
        <button
          onClick={onClose}
          className="px-2 py-1.5 text-xs text-muted hover:text-fg"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}

function ReceiptButton({ b }: { b: TodayBooking }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  if (!b.customerEmail) return null;
  return (
    <button
      disabled={pending || sent}
      onClick={() => start(async () => {
        await sendReceiptForBooking(b.id);
        setSent(true);
      })}
      className="border border-line-2 px-2.5 py-1.5 text-xs text-muted hover:border-accent-soft hover:text-fg disabled:opacity-50"
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
  const [menu, setMenu] = useState<null | "pay" | "cancel">(null);

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
        <span className="w-12 font-display text-sm font-bold text-accent-soft">
          {b.time}
        </span>
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
          ) : menu === "cancel" ? (
            <>
              <span className="mr-1 text-xs text-muted">Avlyse?</span>
              <button
                onClick={() => start(() => cancelBooking(b.id))}
                disabled={pending}
                className="border border-line-2 px-2.5 py-1.5 text-xs font-semibold text-danger hover:border-danger disabled:opacity-50"
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
                className="bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
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
                onClick={() => start(() => markNoShow(b.id))}
                disabled={pending}
                className="border border-line-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
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

      {menu === "pay" && <PayPanel b={b} onClose={() => setMenu(null)} />}
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
