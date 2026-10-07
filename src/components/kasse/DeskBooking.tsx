"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ShopBarber, ShopService } from "@/lib/shop-queries";
import { isAddonCategory } from "@/lib/service-categories";
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
  /** Forhåndsvalgt dato (YYYY-MM-DD) – f.eks. ved klikk i kalenderen. */
  date?: string;
  /** Ønsket klokkeslett (HH:MM); nærmeste ledige tid fra og med velges. */
  time?: string;
};


/* Norske dato-/tidshjelpere – appen styrer formatet selv, uavhengig av
 * nettleserens språk (Chrome viser ellers amerikansk «02:15 PM» / «10/07/2026»). */
function isoToNoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
function noDateToIso(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = +m[1];
  const mo = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
/** Tastetrykk → DD.MM.ÅÅÅÅ (setter punktum automatisk). */
function maskNoDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean);
  return parts.join(".");
}
/** Tastetrykk → HH:MM (24-timer, setter kolon automatisk). */
function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
}
function isValidTime(t: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return !!m && +m[1] < 24 && +m[2] < 60;
}
function noWeekdayLong(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("nb-NO", {
      weekday: "long",
    });
  } catch {
    return "";
  }
}
function osloTodayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

/** Grupper tjenester per kategori (rekkefølgen kommer ferdig sortert fra serveren). */
function groupByCategory(list: ShopService[]): { cat: string; rows: ShopService[] }[] {
  const out: { cat: string; rows: ShopService[] }[] = [];
  for (const s of list) {
    const cat = s.category ?? "Annet";
    let g = out.find((x) => x.cat === cat);
    if (!g) {
      g = { cat, rows: [] };
      out.push(g);
    }
    g.rows.push(s);
  }
  return out;
}

export function DeskBooking({
  services,
  barbers,
  label,
  mode = "new",
  bookingId,
  prefill,
  variant = "primary",
  triggerClassName,
}: {
  services: ShopService[];
  barbers: ShopBarber[];
  label: string;
  mode?: "new" | "reschedule";
  bookingId?: string;
  prefill?: Prefill;
  variant?: "primary" | "small";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn =
    triggerClassName ??
    (variant === "small"
      ? "rounded-md border border-line-2 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
      : "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90");

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

/** Selve booking-popupen – brukes også ved klikk i dagskalenderen. */
export function DeskBookingDialog(props: {
  services: ShopService[];
  barbers: ShopBarber[];
  prefill?: Prefill;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(<Dialog mode="new" {...props} />, document.body);
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
    prefill?.service ??
      (services.find((s) => !isAddonCategory(s.category)) ?? services[0])?.name ??
      "",
  );
  const [barber, setBarber] = useState(
    prefill?.barber ?? barbers[0]?.full_name ?? "",
  );
  const [date, setDate] = useState(prefill?.date ?? "");
  // Dato vises/skrives som DD.MM.ÅÅÅÅ (norsk), uavhengig av nettleserspråk.
  const [dateText, setDateText] = useState(
    prefill?.date ? isoToNoDate(prefill.date) : "",
  );
  // Ønsket tid (fra klikk i kalenderen) – brukes første gang tidene hentes.
  const [wantTime, setWantTime] = useState<string | undefined>(prefill?.time);
  const [timeNote, setTimeNote] = useState<string | null>(null);
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
        if (wantTime) {
          // Klikket tid brukes som den er (også utenfor turnus / i fortiden).
          // Lagringen stopper bare hvis barberen har en annen booking da.
          setTime(wantTime);
          setTimeNote(
            r.includes(wantTime)
              ? null
              : "Utenfor vanlig arbeidstid – lagres likevel når du bekrefter.",
          );
          setWantTime(undefined);
        }
      }
    });
    return () => {
      live = false;
    };
  }, [date, barber, service]);

  // Navn skrevet i søkefeltet (uten å ha valgt et treff) brukes som ny kunde,
  // så man slipper å måtte klikke et søkeresultat for å kunne booke.
  const typedName =
    !locked && !newCustomer && !customerId ? q.trim() : "";
  const readyCustomer =
    locked || customerId || (newCustomer && nyNavn.trim()) || typedName.length >= 2;
  const canSubmit =
    readyCustomer &&
    barber &&
    date &&
    isValidTime(time) &&
    (mode === "reschedule" || service);

  // Hvorfor er knappen grå? (vises under knappen så den aldri «bare» er død)
  const missing = !readyCustomer
    ? "Skriv inn eller velg en kunde"
    : !date
      ? "Velg dato"
      : !isValidTime(time)
        ? "Skriv inn tid (TT:MM)"
        : mode !== "reschedule" && !service
          ? "Velg tjeneste"
          : null;

  function submit() {
    setError(null);
    const startIso = new Date(`${date}T${time}:00`).toISOString();
    start(async () => {
      const res =
        mode === "reschedule" && bookingId
          ? await rescheduleBooking(bookingId, startIso, barber)
          : await createDeskBooking({
              customerId,
              name: newCustomer ? nyNavn : customerName || typedName,
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

  // Hurtigvalg for dato (norsk tidssone).
  const todayIso = osloTodayIso();
  const tomorrowIso = (() => {
    const d = new Date(todayIso + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA");
  })();
  function pickDate(iso: string) {
    setDate(iso);
    setDateText(isoToNoDate(iso));
  }
  function pickTime(t: string) {
    setTime(t);
    setTimeNote(
      !isValidTime(t) || slots.length === 0 || slots.includes(t)
        ? null
        : "Utenfor vanlig arbeidstid – lagres likevel når du bekrefter.",
    );
  }


  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
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
          <div className="mb-4 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
            <span className="text-muted">Kunde: </span>
            <span className="text-fg">{customerName || "—"}</span>
          </div>
        ) : (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted">Kunde</label>
              <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewCustomer(true);
                  setCustomerId(undefined);
                  setCustomerName("");
                  setNyNavn("Drop-in");
                }}
                className="act"
              >
                Drop-in
              </button>
              <button
                onClick={() => {
                  setNewCustomer((v) => !v);
                  setCustomerId(undefined);
                  setCustomerName("");
                }}
                className="act act-accent"
              >
                {newCustomer ? "Søk eksisterende" : "+ Ny kunde"}
              </button>
              </span>
            </div>

            {newCustomer ? (
              <div className="space-y-2">
                <input
                  value={nyNavn}
                  onChange={(e) => setNyNavn(e.target.value)}
                  placeholder="Fullt navn"
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
                <input
                  value={nyTlf}
                  onChange={(e) => setNyTlf(e.target.value)}
                  placeholder="Telefon (valgfri)"
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
                <input
                  value={nyEpost}
                  onChange={(e) => setNyEpost(e.target.value)}
                  placeholder="E-post (valgfri – for bekreftelse)"
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
              </div>
            ) : customerId ? (
              <div className="flex items-center justify-between rounded-md border border-line bg-canvas px-3 py-2 text-sm">
                <span className="text-fg">{customerName}</span>
                <button
                  onClick={() => {
                    setCustomerId(undefined);
                    setCustomerName("");
                    setQ("");
                  }}
                  className="act"
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
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
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
                {typedName.length >= 2 && (
                  <p className="mt-1 text-[11px] text-muted">
                    Lagres som ny kunde: «{typedName}» (eller velg et treff over)
                  </p>
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
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none"
            >
              {groupByCategory(services).map((g) => (
                <optgroup key={g.cat} label={g.cat}>
                  {g.rows.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} · {s.duration_min} min
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        {/* Barber */}
        {mode === "reschedule" ? (
          <div className="mb-3 text-sm">
            <span className="text-muted">Barber: </span>
            <span className="text-fg">{prefill?.barber ?? "—"}</span>
            <p className="mt-1 text-[11px] text-muted">
              «Flytt» endrer kun tid. For å bytte barber: dra kunden til en annen
              barber i kalenderen – den opprinnelige barberen godkjenner med PIN.
            </p>
          </div>
        ) : (
          <div className="mb-3">
            <label className="mb-1 block text-xs text-muted">Barber</label>
            <select
              value={barber}
              onChange={(e) => setBarber(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none"
            >
              {barbers.map((b) => (
                <option key={b.id} value={b.full_name}>
                  {b.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Dato */}
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted">Dato</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={dateText}
              onChange={(e) => {
                const masked = maskNoDate(e.target.value);
                setDateText(masked);
                setDate(noDateToIso(masked) ?? "");
              }}
              inputMode="numeric"
              placeholder="DD.MM.ÅÅÅÅ"
              className="w-36 rounded-md border border-line bg-canvas px-3 py-2 text-sm tabular-nums text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
            />
            {[
              { label: "I dag", iso: todayIso },
              { label: "I morgen", iso: tomorrowIso },
            ].map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => pickDate(d.iso)}
                className={
                  "rounded-md border px-3 py-2 text-xs font-semibold transition-colors " +
                  (date === d.iso
                    ? "border-accent-soft bg-accent-soft/10 text-fg"
                    : "border-line-2 text-muted hover:border-accent-soft hover:text-fg")
                }
              >
                {d.label}
              </button>
            ))}
          </div>
          {date && (
            <p className="mt-1 text-[11px] text-muted">
              <span className="capitalize">{noWeekdayLong(date)}</span> {isoToNoDate(date)}
            </p>
          )}
        </div>

        {/* Tid – ett felt (24-timer). Ledige tider i turnusen vises som forslag. */}
        {date && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">Tid</label>
            <div className="flex items-center gap-2">
              <input
                value={time}
                onChange={(e) => pickTime(maskTime(e.target.value))}
                inputMode="numeric"
                placeholder="TT:MM"
                className="w-24 rounded-md border border-line bg-canvas px-3 py-2 text-sm tabular-nums text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
              />
              {mode !== "reschedule" && (
                <button
                  type="button"
                  onClick={() => {
                    const n = new Date();
                    const hh = String(n.getHours()).padStart(2, "0");
                    const mm = String(Math.floor(n.getMinutes() / 5) * 5).padStart(2, "0");
                    pickDate(todayIso);
                    pickTime(`${hh}:${mm}`);
                  }}
                  className="rounded-md border border-line-2 px-3 py-2 text-xs font-semibold text-fg hover:border-accent-soft"
                >
                  Nå
                </button>
              )}
            </div>

            {timeNote && <p className="mt-1.5 text-xs text-muted">{timeNote}</p>}

            {loadingSlots ? (
              <p className="mt-2 text-xs text-muted">Henter ledige tider…</p>
            ) : slots.length > 0 ? (
              <div className="mt-2">
                <p className="mb-1 text-[11px] text-muted">Ledige tider hos {barber}:</p>
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => pickTime(s)}
                      className={
                        "rounded-md border px-2 py-1.5 text-sm tabular-nums " +
                        (time === s
                          ? "border-accent-soft bg-accent-soft/15 text-accent-soft"
                          : "border-line text-muted hover:border-accent-soft hover:text-fg")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">
                Ingen ledige tider i turnusen denne dagen – skriv inn tiden over.
                Den lagres så lenge {barber} ikke har en annen booking da.
              </p>
            )}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {missing && !pending && (
            <span className="mr-auto text-xs text-muted">{missing}</span>
          )}
          <button
            onClick={onClose}
            className="act"
          >
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
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
