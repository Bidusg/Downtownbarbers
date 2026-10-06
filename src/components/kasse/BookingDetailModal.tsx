"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgendaBooking, ShopBarber, ShopService } from "@/lib/shop-queries";
import { markNoShow, cancelBooking, reopenBooking } from "@/app/kasse/actions";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { PaymentControls } from "@/components/kasse/PaymentControls";
import { SendReceiptButton } from "@/components/kasse/SendReceiptButton";
import { Avatar } from "@/components/ui/Avatar";
import { bookingStatusLabel } from "@/lib/format";

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
  const [mode, setMode] = useState<
    "actions" | "pay" | "cancel" | "noshow" | "reopen" | "noshowDone"
  >("actions");
  // Resultat av e-postvarsel ved «ikke møtt» (null = ikke forsøkt).
  const [notifyResult, setNotifyResult] = useState<boolean | null>(null);
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const b = booking;
  // «Ikke møtt» gir først mening når timen har startet.
  const started = new Date(b.start_at).getTime() <= Date.now();
  const finished =
    b.status === "completed" ||
    b.status === "no_show" ||
    b.status === "cancelled";

  function closeAndRefresh() {
    onClose();
    router.refresh();
  }

  function act(
    fn: () => Promise<{ error?: string } | void | null | undefined>,
    after?: (res: { error?: string } | void | null | undefined) => boolean,
  ) {
    start(async () => {
      setErr(null);
      try {
        const res = await fn();
        if (res && typeof res === "object" && res.error) {
          setErr(res.error);
          return;
        }
        // `after` kan returnere true for å holde modalen åpen (f.eks. for å vise resultat).
        if (after?.(res)) {
          router.refresh();
          return;
        }
        closeAndRefresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Noe gikk galt. Prøv igjen.");
      }
    });
  }

  const errBox = err ? (
    <p
      role="alert"
      className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
    >
      {err}
    </p>
  ) : null;

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
          {b.addons && b.addons.length > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-muted">Tillegg</span>
              <span className="text-right text-fg">
                {b.addons.map((a) => a.name).join(", ")}
              </span>
            </div>
          )}
          {((b.group_size ?? 1) > 1 || b.person_label) && (
            <div className="flex justify-between">
              <span className="text-muted">Gruppe</span>
              <span className="text-accent-soft">
                {b.person_label ?? `Del av gruppebooking (${b.group_size ?? 2} personer)`}
              </span>
            </div>
          )}
          {b.notes && (
            <div className="flex flex-col gap-1">
              <span className="text-muted">Notat fra kunden</span>
              <span className="whitespace-pre-wrap rounded-md border border-accent-soft/40 bg-accent-soft/10 px-3 py-2 text-fg">
                {b.notes}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">Status</span>
            <span className="text-fg">{bookingStatusLabel(b.status)}</span>
          </div>
          {b.phone && (
            <div className="flex justify-between">
              <span className="text-muted">Telefon</span>
              <a
                href={`tel:${b.phone.replace(/\s/g, "")}`}
                className="font-medium text-accent-soft hover:underline"
              >
                {b.phone}
              </a>
            </div>
          )}
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
              className="act mt-3"
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
                onClick={() => {
                  const wantNotify = !!b.email && notify;
                  act(
                    () => markNoShow(b.id, { notify: wantNotify }),
                    (res) => {
                      if (!wantNotify) return false;
                      const emailed =
                        !!res && typeof res === "object" && "emailed" in res
                          ? !!(res as { emailed?: boolean }).emailed
                          : false;
                      setNotifyResult(emailed);
                      setMode("noshowDone");
                      return true;
                    },
                  );
                }}
                className="act act-solid-danger"
              >
                {pending ? "Registrerer …" : "Ja, ikke møtt"}
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  setMode("actions");
                }}
                className="act"
              >
                Avbryt
              </button>
            </div>
            {errBox}
          </div>
        ) : mode === "noshowDone" ? (
          <div>
            <p className="mb-2 text-sm text-fg">Timen er markert som ikke møtt.</p>
            <p
              role="status"
              className={
                notifyResult
                  ? "mb-3 rounded-md border border-line-2 bg-canvas px-3 py-2 text-xs text-fg"
                  : "mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
              }
            >
              {notifyResult ? "Varsel sendt til kunden" : "Varsel kunne ikke sendes"}
            </p>
            <button onClick={onClose} className="act">
              Lukk
            </button>
          </div>
        ) : mode === "cancel" ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Avbestille denne timen?</span>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const res = await cancelBooking(b.id);
                    if (res?.error) {
                      setErr(res.error);
                      return;
                    }
                    onClose();
                    router.refresh();
                  })
                }
                className="act act-solid-danger"
              >
                {pending ? "Avbestiller …" : "Ja, avbestill"}
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  setMode("actions");
                }}
                className="act"
              >
                Avbryt
              </button>
            </div>
            {err && (
              <p className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {err}
              </p>
            )}
          </div>
        ) : mode === "reopen" ? (
          <div>
            <p className="mb-2 text-sm text-fg">
              {b.status === "completed"
                ? "Gjenåpne timen? Salgsregistreringen slettes."
                : "Gjenåpne timen og fjerne «ikke møtt»?"}
            </p>
            {err && (
              <p className="mb-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {err}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const res = await reopenBooking(b.id);
                    if (res?.error) {
                      setErr(res.error);
                      return;
                    }
                    onClose();
                    router.refresh();
                  })
                }
                className="act act-solid-danger"
              >
                {pending ? "Gjenåpner …" : "Ja, gjenåpne"}
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  setMode("actions");
                }}
                className="act"
              >
                Avbryt
              </button>
            </div>
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
                  onClick={() => {
                    setErr(null);
                    setMode("noshow");
                  }}
                  disabled={!started}
                  title={started ? undefined : "Kan settes når timen har startet"}
                  className="rounded-md border border-line-2 px-3 py-2 text-sm text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Ikke møtt
                </button>
                <button
                  onClick={() => {
                    setErr(null);
                    setMode("cancel");
                  }}
                  className="act act-danger"
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
                {(b.status === "completed" || b.status === "no_show") && (
                  <button
                    onClick={() => {
                      setErr(null);
                      setMode("reopen");
                    }}
                    className="act"
                  >
                    Gjenåpne
                  </button>
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
