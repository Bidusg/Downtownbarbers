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
  getIsAdminUser,
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

  // Steg-for-steg (kun ved ny booking). Flytt («reschedule») bruker enkel visning.
  const [step, setStep] = useState(0);
  // «Drop-in» er kun for admin/eier – shop-brukere skal ikke se den.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let live = true;
    getIsAdminUser().then((v) => live && setIsAdmin(v));
    return () => {
      live = false;
    };
  }, []);

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

  // Ny kunde krever navn OG telefon (påkrevd). E-post er fortsatt valgfri.
  const phoneOk = nyTlf.trim().length >= 3;
  const newCustomerReady = newCustomer && nyNavn.trim().length > 0 && phoneOk;
  const readyCustomer = locked || !!customerId || newCustomerReady;
  const timeReady = !!date && isValidTime(time);
  const canSubmit =
    readyCustomer && barber && timeReady && (mode === "reschedule" || service);

  // Gyldighet per steg (ny booking): Tjeneste → Barber → Tid → Kunde.
  const stepValid = [!!service, !!barber, timeReady, readyCustomer];
  const custHint = newCustomer
    ? !nyNavn.trim()
      ? "Fyll inn navn"
      : !phoneOk
        ? "Telefon er påkrevd"
        : null
    : !customerId
      ? "Velg et treff, eller trykk «Ny kunde»"
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


  const fieldCls =
    "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none";

  const serviceField = (
    <div>
      <label className="mb-1 block text-xs text-muted">Tjeneste</label>
      <select
        value={service}
        onChange={(e) => setService(e.target.value)}
        className={fieldCls}
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
  );

  const barberField = (
    <div>
      <label className="mb-1 block text-xs text-muted">Barber</label>
      <select
        value={barber}
        onChange={(e) => setBarber(e.target.value)}
        className={fieldCls}
      >
        {barbers.map((b) => (
          <option key={b.id} value={b.full_name}>
            {b.full_name}
          </option>
        ))}
      </select>
    </div>
  );

  const dateField = (
    <div>
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
  );

  const timeField = !date ? (
    <p className="text-sm text-muted">Velg dato først.</p>
  ) : (
    <div>
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
  );

  const customerField = locked ? (
    <div className="rounded-md border border-line bg-canvas px-3 py-2 text-sm">
      <span className="text-muted">Kunde: </span>
      <span className="text-fg">{customerName || "—"}</span>
    </div>
  ) : (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs text-muted">Kunde</label>
        <span className="flex items-center gap-3">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setNewCustomer(true);
                setCustomerId(undefined);
                setCustomerName("");
                setNyNavn("Drop-in");
                setNyTlf("00000000");
              }}
              className="act"
            >
              Drop-in
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNewCustomer((v) => !v);
              setCustomerId(undefined);
              setCustomerName("");
              if (!newCustomer && q.trim()) setNyNavn(q.trim());
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
            className={fieldCls}
          />
          <input
            value={nyTlf}
            onChange={(e) => setNyTlf(e.target.value)}
            placeholder="Telefon (påkrevd)"
            inputMode="tel"
            className={fieldCls}
          />
          <input
            value={nyEpost}
            onChange={(e) => setNyEpost(e.target.value)}
            placeholder="E-post (valgfri – for bekreftelse)"
            className={fieldCls}
          />
        </div>
      ) : customerId ? (
        <div className="flex items-center justify-between rounded-md border border-line bg-canvas px-3 py-2 text-sm">
          <span className="text-fg">{customerName}</span>
          <button
            type="button"
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
            className={fieldCls}
          />
          {hits.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto border border-line">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
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
  );

  const STEPS = ["Tjeneste", "Barber", "Tid", "Kunde"];
  const stepper = (
    <ol className="mb-4 flex items-center gap-1 text-[11px]">
      {STEPS.map((s, i) => {
        const done = i < step;
        const cls =
          i === step
            ? "bg-accent text-accent-fg"
            : done
              ? "border border-accent-soft text-accent-soft"
              : "border border-line-2 text-muted";
        return (
          <li key={s} className="flex flex-1 items-center">
            <button
              type="button"
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
              className={`w-full rounded-md px-2 py-1 font-semibold ${cls} ${i < step ? "cursor-pointer" : ""}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        );
      })}
    </ol>
  );

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

        {mode === "reschedule" ? (
          <>
            <div className="mb-3 text-sm">
              <span className="text-muted">Kunde: </span>
              <span className="text-fg">{customerName || "—"}</span>
            </div>
            <div className="mb-3 text-sm">
              <span className="text-muted">Tjeneste: </span>
              <span className="text-fg">{prefill?.service ?? "—"}</span>
            </div>
            <div className="mb-3 text-sm">
              <span className="text-muted">Barber: </span>
              <span className="text-fg">{prefill?.barber ?? "—"}</span>
              <p className="mt-1 text-[11px] text-muted">
                «Flytt» endrer kun tid. For å bytte barber: dra kunden til en annen
                barber i kalenderen – den opprinnelige barberen godkjenner med PIN.
              </p>
            </div>
            <div className="mb-3">{dateField}</div>
            <div className="mb-4">{timeField}</div>

            {error && <p className="mb-3 text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-end gap-3">
              {!timeReady && !pending && (
                <span className="mr-auto text-xs text-muted">Skriv inn tid (TT:MM)</span>
              )}
              <button type="button" onClick={onClose} className="act">
                Avbryt
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || pending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "…" : "Flytt time"}
              </button>
            </div>
          </>
        ) : (
          <>
            {stepper}

            <div className="min-h-[7rem]">
              {step === 0 && serviceField}
              {step === 1 && barberField}
              {step === 2 && (
                <div className="space-y-3">
                  {dateField}
                  {timeField}
                </div>
              )}
              {step === 3 && customerField}
            </div>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-4 flex items-center gap-3">
              {step === 2 && !timeReady && !pending && (
                <span className="text-xs text-muted">Velg dato og tid</span>
              )}
              {step === 3 && custHint && !pending && (
                <span className="text-xs text-muted">{custHint}</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="act"
                  >
                    ← Tilbake
                  </button>
                ) : (
                  <button type="button" onClick={onClose} className="act">
                    Avbryt
                  </button>
                )}
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={() => stepValid[step] && setStep(step + 1)}
                    disabled={!stepValid[step]}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Neste →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit || pending}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {pending ? "…" : "Bekreft booking"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
