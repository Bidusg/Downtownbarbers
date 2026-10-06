"use client";

import { useState, useTransition } from "react";
import type { TodayBooking } from "@/lib/dashboard-queries";
import type { ShopBarber, ShopService } from "@/lib/shop-queries";
import {
  markNoShow,
  cancelBooking,
  reopenBooking,
  sendReceiptForBooking,
} from "@/app/kasse/actions";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { PaymentControls } from "@/components/kasse/PaymentControls";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

function ReceiptButton({ b }: { b: TodayBooking }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!b.customerEmail) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        disabled={pending || sent}
        onClick={() =>
          start(async () => {
            setErr(null);
            try {
              const res = await sendReceiptForBooking(b.id);
              if (res?.error) {
                setErr(res.error);
                return;
              }
              setSent(true);
            } catch {
              setErr("Kvitteringen kunne ikke sendes.");
            }
          })
        }
        className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-50"
      >
        {sent ? "Sendt ✓" : pending ? "Sender …" : err ? "Prøv igjen" : "Kvittering"}
      </button>
      {err && (
        <span role="alert" className="max-w-[220px] text-xs text-danger">
          {err}
        </span>
      )}
    </span>
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
  const [menu, setMenu] = useState<
    null | "pay" | "cancel" | "noshow" | "reopen"
  >(null);
  const [notify, setNotify] = useState(true);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  // Feil/beskjed som vises under raden (ikke møtt / gjenåpne).
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

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
            Avbestilt
          </span>
        )}

        <span className="flex items-center gap-2">
          {finished ? (
            menu === "reopen" ? (
              <>
                <span className="mr-1 text-xs text-muted">
                  {done ? "Gjenåpne og slette salget?" : "Gjenåpne timen?"}
                </span>
                <button
                  onClick={() =>
                    start(async () => {
                      setRowErr(null);
                      const res = await reopenBooking(b.id);
                      if (res?.error) setRowErr(res.error);
                      else setMenu(null);
                    })
                  }
                  disabled={pending}
                  className="act act-solid-danger"
                >
                  {pending ? "Gjenåpner …" : "Ja, gjenåpne"}
                </button>
                <button
                  onClick={() => {
                    setMenu(null);
                    setRowErr(null);
                  }}
                  disabled={pending}
                  aria-label="Avbryt"
                  title="Avbryt"
                  className="act"
                >
                  ✕
                </button>
              </>
            ) : (
              <>
                {done && <ReceiptButton b={b} />}
                {(done || noshow) && (
                  <button
                    onClick={() => {
                      setRowErr(null);
                      setNotice(null);
                      setMenu("reopen");
                    }}
                    disabled={pending}
                    className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
                  >
                    Gjenåpne
                  </button>
                )}
                {rebook}
              </>
            )
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
                    setRowErr(null);
                    setNotice(null);
                    const wantNotify = !!b.customerEmail && notify;
                    try {
                      const res = await markNoShow(b.id, { notify: wantNotify });
                      if (res?.error) {
                        setRowErr(res.error);
                        return;
                      }
                      setMenu(null);
                      if (wantNotify) {
                        setNotice(
                          res?.emailed
                            ? { ok: true, text: "Varsel sendt til kunden" }
                            : { ok: false, text: "Varsel kunne ikke sendes" },
                        );
                      }
                    } catch {
                      setRowErr("Kunne ikke markere som ikke møtt. Prøv igjen.");
                    }
                  })
                }
                disabled={pending}
                className="act act-solid-danger"
              >
                {pending ? "Registrerer …" : "Ja, ikke møtt"}
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  setRowErr(null);
                }}
                disabled={pending}
                aria-label="Avbryt"
                title="Avbryt"
                className="act"
              >
                ✕
              </button>
            </>
          ) : menu === "cancel" ? (
            <>
              {cancelErr ? (
                <span className="mr-1 max-w-[220px] text-xs text-danger">
                  {cancelErr}
                </span>
              ) : (
                <span className="mr-1 text-xs text-muted">Avbestille?</span>
              )}
              {!cancelErr && (
                <button
                  onClick={() =>
                    start(async () => {
                      setCancelErr(null);
                      const res = await cancelBooking(b.id);
                      if (res?.error) setCancelErr(res.error);
                      else setMenu(null);
                    })
                  }
                  disabled={pending}
                  className="act act-solid-danger"
                >
                  {pending ? "Avbestiller …" : "Ja, avbestill"}
                </button>
              )}
              <button
                onClick={() => {
                  setMenu(null);
                  setCancelErr(null);
                }}
                disabled={pending}
                aria-label="Avbryt"
                title="Avbryt"
                className="act"
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
                onClick={() => {
                  setRowErr(null);
                  setNotice(null);
                  setMenu("noshow");
                }}
                disabled={pending}
                className="rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
              >
                Ikke møtt
              </button>
              <button
                onClick={() => {
                  setNotice(null);
                  setMenu("cancel");
                }}
                disabled={pending}
                className="act act-danger"
              >
                Avbestill
              </button>
            </>
          )}
        </span>
      </div>

      {rowErr && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {rowErr}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className={
            notice.ok
              ? "mt-2 text-xs text-muted"
              : "mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          }
        >
          {notice.text}
        </p>
      )}

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
    return <EmptyState description="Ingen timer i dag." />;
  }
  return (
    <ul className="divide-y divide-line">
      {bookings.map((b) => (
        <Row key={b.id} b={b} services={services} barbers={barbers} />
      ))}
    </ul>
  );
}
