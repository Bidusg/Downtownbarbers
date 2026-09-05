"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgendaBooking, ShopBarber, ShopService } from "@/lib/shop-queries";
import { markNoShow, cancelBooking } from "@/app/kasse/actions";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { PaymentControls } from "@/components/kasse/PaymentControls";
import { SendReceiptButton } from "@/components/kasse/SendReceiptButton";
import { Avatar } from "@/components/ui/Avatar";

const statusLabel: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avlyst",
  no_show: "Ikke møtt",
};

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

export function BookingDetailModal({
  booking,
  services,
  barbers,
  barberColor,
  onClose,
}: {
  booking: AgendaBooking;
  services: ShopService[];
  barbers: ShopBarber[];
  barberColor: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"actions" | "pay" | "cancel" | "noshow">(
    "actions",
  );
  const [notify, setNotify] = useState(true);

  const b = booking;
  const finished =
    b.status === "completed" ||
    b.status === "no_show" ||
    b.status === "cancelled";

  function act(fn: () => Promise<unknown>) {
    start(async () => {
      await fn();
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topp */}
        <div className="mb-4 flex items-start gap-3">
          <Avatar name={b.customer ?? "?"} colorKey={b.customer_id ?? undefined} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold">
              {b.customer ?? "—"}
            </p>
            <p className="text-xs text-muted">
              {hhmm(b.start_at)}–{hhmm(b.end_at)} ·{" "}
              <span
                className="inline-flex items-center gap-1"
                style={{ color: barberColor }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: barberColor }}
                />
                {b.barber ?? "—"}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-2 text-muted hover:text-fg"
            aria-label="Lukk"
          >
            ✕
          </button>
        </div>

        {/* Detaljer */}
        <div className="mb-4 space-y-1.5 rounded-lg bg-canvas p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Tjeneste</span>
            <span className="text-fg">{b.service ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Status</span>
            <span className="text-fg">{statusLabel[b.status] ?? b.status}</span>
          </div>
          {b.email && (
            <div className="flex justify-between">
              <span className="text-muted">E-post</span>
              <a
                href={`mailto:${b.email}`}
                className="truncate text-accent-soft hover:underline"
              >
                {b.email}
              </a>
            </div>
          )}
        </div>

        {/* Handlinger */}
        {mode === "pay" ? (
          <div>
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Til kasse
            </p>
            <PaymentControls
              bookingId={b.id}
              customerName={b.customer ?? ""}
              customerEmail={b.email}
              onDone={() => {
                onClose();
                router.refresh();
              }}
            />
            <button
              onClick={() => setMode("actions")}
              className="mt-3 text-xs text-muted hover:text-fg"
            >
              ← Tilbake
            </button>
          </div>
        ) : mode === "noshow" ? (
          <div>
            <p className="mb-2 text-sm text-fg">Marker som ikke møtt?</p>
            {b.email ? (
              <label className="mb-3 flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                  className="h-4 w-4 accent-[#F47721]"
                />
                Send varsel på e-post til kunden
              </label>
            ) : (
              <p className="mb-3 text-xs text-muted">
                Kunden har ingen e-post, så det sendes ikke varsel.
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                disabled={pending}
                onClick={() =>
                  act(() =>
                    markNoShow(b.id, { notify: !!b.email && notify }),
                  )
                }
                className="rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold text-danger hover:border-danger disabled:opacity-50"
              >
                {pending ? "…" : "Ja, ikke møtt"}
              </button>
              <button
                onClick={() => setMode("actions")}
                className="px-2 py-1.5 text-xs text-muted hover:text-fg"
              >
                Angre
              </button>
            </div>
          </div>
        ) : mode === "cancel" ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Avlyse denne timen?</span>
            <button
              disabled={pending}
              onClick={() => act(() => cancelBooking(b.id))}
              className="rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold text-danger hover:border-danger disabled:opacity-50"
            >
              Ja, avlys
            </button>
            <button
              onClick={() => setMode("actions")}
              className="px-2 py-1.5 text-xs text-muted hover:text-fg"
            >
              Angre
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {!finished && (
              <>
                <button
                  onClick={() => setMode("pay")}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
                >
                  Til kasse
                </button>
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
                <button
                  onClick={() => setMode("noshow")}
                  className="rounded-md border border-line-2 px-3 py-2 text-sm text-muted transition-colors hover:text-fg"
                >
                  Ikke møtt
                </button>
                <button
                  onClick={() => setMode("cancel")}
                  className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-danger"
                >
                  Avbestill
                </button>
              </>
            )}
            {finished && (
              <>
                {b.status === "completed" && b.email && (
                  <SendReceiptButton bookingId={b.id} />
                )}
                <DeskBooking
                  services={services}
                  barbers={barbers}
                  label="Book ny time"
                  variant="small"
                  prefill={{
                    customerId: b.customer_id ?? undefined,
                    customerName: b.customer ?? "",
                    service: b.service ?? undefined,
                    barber: b.barber ?? undefined,
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
