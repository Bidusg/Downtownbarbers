"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShopBarber, ShopService } from "@/lib/shop-queries";
import {
  createDeskBooking,
  rescheduleBooking,
  searchCustomers,
  getSlots,
  type CustomerHit,
} from "@/app/kasse/actions";

type Prefill = {
  customerId?: string;
  customerName?: string;
  service?: string;
  barber?: string;
};

export function DeskBooking({
  services,
  barbers,
  label,
  mode = "new",
  bookingId,
  prefill,
  variant = "primary",
}: {
  services: ShopService[];
  barbers: ShopBarber[];
  label: string;
  mode?: "new" | "reschedule";
  bookingId?: string;
  prefill?: Prefill;
  variant?: "primary" | "small";
}) {
  const [open, setOpen] = useState(false);
  const btn =
    variant === "small"
      ? "border border-line-2 px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent-soft hover:text-fg"
      : "bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90";

  return (
    <>
      <button className={btn} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Dialog
          services={services}
          barbers={barbers}
          mode={mode}
          bookingId={bookingId}
          prefill={prefill}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Dialog({
  services,
  barbers,
  mode,
  bookingId,
  prefill,
  onClose,
}: {
  services: ShopService[];
  barbers: ShopBarber[];
  mode: "new" | "reschedule";
  bookingId?: string;
  prefill?: Prefill;
  onClose: () => void;
}) {
  const router = useRouter();
  const locked = mode === "reschedule" || !!prefill?.customerId;

  // Kunde
  const [customerId, setCustomerId] = useState<string | undefined>(
    prefill?.customerId,
  );
  const [customerName, setCustomerName] = useState(prefill?.customerName ?? "");
  const [newCustomer, setNewCustomer] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [nyNavn, setNyNavn] = useState("");
  const [nyTlf, setNyTlf] = useState("");
  const [nyEpost, setNyEpost] = useState("");

  // Detaljer
  const [service, setService] = useState(
    prefill?.service ?? services[0]?.name ?? "",
  );
  const [barber, setBarber] = useState(
    prefill?.barber ?? barbers[0]?.full_name ?? "",
  );
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Kundesøk
  useEffect(() => {
    if (locked || newCustomer || q.trim().length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchCustomers(q);
      if (live) setHits(r);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, locked, newCustomer]);

  // Hent ledige tider når barber/tjeneste/dato endres
  useEffect(() => {
    if (!date || !barber || !service) {
      setSlots([]);
      return;
    }
    let live = true;
    setLoadingSlots(true);
    setTime("");
    getSlots(barber, service, date).then((r) => {
      if (live) {
        setSlots(r);
        setLoadingSlots(false);
      }
    });
    return () => {
      live = false;
    };
  }, [date, barber, service]);

  const readyCustomer = locked || customerId || (newCustomer && nyNavn.trim());
  const canSubmit = readyCustomer && barber && time && (mode === "reschedule" || service);

  function submit() {
    setError(null);
    const startIso = new Date(`${date}T${time}:00`).toISOString();
    start(async () => {
      const res =
        mode === "reschedule" && bookingId
          ? await rescheduleBooking(bookingId, startIso, barber)
          : await createDeskBooking({
              customerId,
              name: newCustomer ? nyNavn : customerName,
              email: newCustomer ? nyEpost : undefined,
              phone: newCustomer ? nyTlf : undefined,
              service,
              barber,
              start: startIso,
            });
      if (res.error) {
        setError(res.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  const title =
    mode === "reschedule"
      ? "Flytt time"
      : prefill?.customerId
        ? "Book ny time"
        : "Ny booking";

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-md border border-line bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-fg"
            aria-label="Lukk"
          >
            ✕
          </button>
        </div>

        {/* Kunde */}
        {locked ? (
          <div className="mb-4 border border-line bg-canvas px-3 py-2 text-sm">
            <span className="text-muted">Kunde: </span>
            <span className="text-fg">{customerName || "—"}</span>
          </div>
        ) : (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted">Kunde</label>
              <button
                onClick={() => {
                  setNewCustomer((v) => !v);
                  setCustomerId(undefined);
                  setCustomerName("");
                }}
                className="text-xs font-semibold text-accent-soft hover:underline"
              >
                {newCustomer ? "Søk eksisterende" : "+ Ny kunde"}
              </button>
            </div>

            {newCustomer ? (
              <div className="space-y-2">
                <input
                  value={nyNavn}
                  onChange={(e) => setNyNavn(e.target.value)}
                  placeholder="Fullt navn"
                  className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
                <input
                  value={nyTlf}
                  onChange={(e) => setNyTlf(e.target.value)}
                  placeholder="Telefon (valgfri)"
                  className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
                <input
                  value={nyEpost}
                  onChange={(e) => setNyEpost(e.target.value)}
                  placeholder="E-post (valgfri – for bekreftelse)"
                  className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
              </div>
            ) : customerId ? (
              <div className="flex items-center justify-between border border-line bg-canvas px-3 py-2 text-sm">
                <span className="text-fg">{customerName}</span>
                <button
                  onClick={() => {
                    setCustomerId(undefined);
                    setCustomerName("");
                    setQ("");
                  }}
                  className="text-xs text-muted hover:text-fg"
                >
                  Endre
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Søk navn / telefon / e-post…"
                  className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
                {hits.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto border border-line">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          onClick={() => {
                            setCustomerId(h.id);
                            setCustomerName(h.full_name);
                            setHits([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                        >
                          <span className="text-fg">{h.full_name}</span>
                          <span className="ml-2 text-xs text-muted">
                            {h.phone ?? h.email ?? ""} · {h.visits} besøk
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tjeneste */}
        {mode === "reschedule" ? (
          <div className="mb-3 text-sm">
            <span className="text-muted">Tjeneste: </span>
            <span className="text-fg">{prefill?.service ?? "—"}</span>
          </div>
        ) : (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-muted">Tjeneste</label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none"
            >
              {services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Barber */}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted">Barber</label>
          <select
            value={barber}
            onChange={(e) => setBarber(e.target.value)}
            className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none"
          >
            {barbers.map((b) => (
              <option key={b.id} value={b.full_name}>
                {b.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Dato */}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted">Dato</label>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none"
          />
        </div>

        {/* Tid */}
        {date && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">Ledig tid</label>
            {loadingSlots ? (
              <p className="text-sm text-muted">Henter ledige tider…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted">Ingen ledige tider denne dagen.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTime(s)}
                    className={
                      "border px-2 py-1.5 text-sm " +
                      (time === s
                        ? "border-accent-soft bg-accent-soft/15 text-accent-soft"
                        : "border-line text-muted hover:border-accent-soft hover:text-fg")
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-fg"
          >
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || pending}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {pending
              ? "…"
              : mode === "reschedule"
                ? "Flytt time"
                : "Bekreft booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
