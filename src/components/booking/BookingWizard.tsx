"use client";

import { useEffect, useMemo, useState } from "react";
import { createBooking } from "@/app/booking/actions";
import { getAvailableSlots } from "@/app/booking/availability-actions";
import { isValidEmail, isValidNorwegianPhone } from "@/lib/validate";

export type WizService = {
  name: string;
  price: string;
  duration: string;
  category: string;
};
export type WizBarber = { name: string; title: string };

const STEPS = ["Tjeneste", "Barber", "Tid", "Kontakt"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingWizard({
  services,
  barbers,
}: {
  services: WizService[];
  barbers: WizBarber[];
}) {
  const [step, setStep] = useState(0);
  const [service, setService] = useState<WizService | null>(null);
  const [barber, setBarber] = useState<WizBarber | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const min = useMemo(() => todayStr(), []);
  const cats = useMemo(
    () => Array.from(new Set(services.map((s) => s.category))),
    [services],
  );

  // Hent ledige tider når dato/barber/tjeneste er valgt
  useEffect(() => {
    let active = true;
    if (step === 2 && date && barber && service) {
      setLoadingSlots(true);
      setTime("");
      getAvailableSlots(barber.name, service.name, date).then((s) => {
        if (active) {
          setSlots(s);
          setLoadingSlots(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [step, date, barber, service]);

  const emailOk = isValidEmail(email);
  const phoneOk = isValidNorwegianPhone(phone);

  const canNext =
    (step === 0 && service) ||
    (step === 1 && barber) ||
    (step === 2 && date && time) ||
    step === 3;

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createBooking({
      serviceName: service!.name,
      barberName: barber!.name,
      date,
      time,
      name,
      email,
      phone,
      price: service!.price,
    });
    setPending(false);
    if (res?.error) setError(res.error);
    else {
      setBookingId(res.bookingId ?? null);
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <p className="font-display text-3xl font-bold text-fg">Takk! 💈</p>
        <p className="mt-4 text-muted">
          Timen din er bekreftet: <strong className="text-fg">{service?.name}</strong> hos{" "}
          <strong className="text-fg">{barber?.name}</strong>
          <br />
          {date} kl. {time}
        </p>
        <p className="mt-6 text-sm text-muted">Vi sender en bekreftelse på e-post.</p>
        {bookingId && (
          <a
            href={`/api/vipps/create?booking=${bookingId}`}
            className="mt-6 inline-block bg-accent-soft px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Betal depositum med Vipps
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="border border-line bg-surface">
      <div className="flex border-b border-line">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={
              "flex-1 px-3 py-3 text-center text-xs font-semibold tracking-wide uppercase " +
              (i === step
                ? "bg-accent text-accent-fg"
                : i < step
                  ? "text-accent-soft"
                  : "text-muted")
            }
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      <div className="p-6">
        {step === 0 && (
          <div className="space-y-6">
            {cats.map((cat) => (
              <div key={cat}>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
                  {cat}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {services
                    .filter((s) => s.category === cat)
                    .map((s) => (
                      <button
                        key={s.name}
                        onClick={() => setService(s)}
                        className={
                          "flex items-center justify-between border p-4 text-left transition-colors " +
                          (service?.name === s.name
                            ? "border-accent-soft bg-accent-soft/5"
                            : "border-line hover:border-line-2")
                        }
                      >
                        <span>
                          <span className="block font-medium text-fg">{s.name}</span>
                          <span className="block text-xs text-muted">{s.duration}</span>
                        </span>
                        <span className="font-display text-sm text-fg">{s.price}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {barbers.map((b) => (
              <button
                key={b.name}
                onClick={() => setBarber(b)}
                className={
                  "border p-4 text-center transition-colors " +
                  (barber?.name === b.name
                    ? "border-accent-soft bg-accent-soft/5"
                    : "border-line hover:border-line-2")
                }
              >
                <span className="mx-auto mb-2 flex h-12 w-12 items-center justify-center bg-surface-2 font-display text-lg font-bold text-fg">
                  {b.name.charAt(0)}
                </span>
                <span className="block font-medium text-fg">{b.name}</span>
                <span className="block text-xs text-muted">{b.title}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">
                Dato
              </label>
              <input
                type="date"
                value={date}
                min={min}
                onChange={(e) => setDate(e.target.value)}
                className="border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold tracking-wide text-muted uppercase">
                Ledige tider {service ? `· ${service.duration}` : ""}
              </label>
              {!date ? (
                <p className="text-sm text-muted">Velg en dato først.</p>
              ) : loadingSlots ? (
                <p className="text-sm text-muted">Henter ledige tider …</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted">
                  Ingen ledige tider denne dagen (stengt eller fullt). Prøv en annen dato.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTime(t)}
                      className={
                        "border py-2 text-sm transition-colors " +
                        (time === t
                          ? "border-accent-soft bg-accent-soft/10 text-fg"
                          : "border-line text-muted hover:border-line-2 hover:text-fg")
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="mb-2 border border-line bg-surface-2 p-4 text-sm text-muted">
              <strong className="text-fg">{service?.name}</strong> ({service?.duration}) hos{" "}
              <strong className="text-fg">{barber?.name}</strong> · {date} kl. {time} ·{" "}
              <span className="text-fg">{service?.price}</span>
            </div>
            <input
              placeholder="Fullt navn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
            />
            <div>
              <input
                placeholder="E-post"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
              />
              {email && !emailOk && (
                <p className="mt-1 text-xs text-danger">Ugyldig e-postadresse.</p>
              )}
            </div>
            <div>
              <input
                placeholder="Telefon (8 siffer)"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
              />
              {phone && !phoneOk && (
                <p className="mt-1 text-xs text-danger">Ugyldig norsk telefonnummer.</p>
              )}
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line p-4">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-4 py-2 text-sm text-muted hover:text-fg disabled:opacity-40"
        >
          Tilbake
        </button>
        {step < 3 ? (
          <button
            onClick={() => canNext && setStep((s) => s + 1)}
            disabled={!canNext}
            className="bg-accent px-6 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            Neste
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={pending || !name.trim() || !emailOk || !phoneOk}
            className="bg-accent px-6 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            {pending ? "Bekrefter …" : "Bekreft booking"}
          </button>
        )}
      </div>
    </div>
  );
}
