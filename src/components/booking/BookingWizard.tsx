"use client";

import { useEffect, useMemo, useState } from "react";
import { createBooking } from "@/app/booking/actions";
import { getAvailableSlotsRange } from "@/app/booking/availability-actions";
import { isValidEmail, isValidNorwegianPhone } from "@/lib/validate";
import { eventLinks } from "@/lib/calendar-links";
import { Button } from "@/components/ui/Button";

export type WizService = {
  name: string;
  price: string;
  duration: string;
  category: string;
  description?: string;
};
export type WizBarber = { name: string; title: string };

const STEPS = ["Tjeneste", "Barber", "Tid", "Kontakt"];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingWizard({
  services,
  barbers,
  exclusions = {},
  levelPrices = {},
  barberLevels = {},
  closedWeekdays = [],
  initialServiceName,
  initialBarberName,
}: {
  services: WizService[];
  barbers: WizBarber[];
  /** Tjeneste-navn → barber-navn som IKKE utfører tjenesten. */
  exclusions?: Record<string, string[]>;
  /** Tjeneste-navn → nivå-slug → pris (nivåpris når barber er valgt). */
  levelPrices?: Record<string, Record<string, number>>;
  /** Barber-navn → nivå-slug. */
  barberLevels?: Record<string, string>;
  /** Ukedager (0=søndag … 6=lørdag) salongen er stengt – filtreres bort fra dagvalget. */
  closedWeekdays?: number[];
  /** Forhåndsvalgt tjeneste/barber (f.eks. «Book på nytt» fra min-side). */
  initialServiceName?: string;
  initialBarberName?: string;
}) {
  // «Book på nytt»: forhåndsvelg tjeneste + barber og hopp til riktig steg.
  const preService = initialServiceName
    ? services.find((s) => s.name === initialServiceName) ?? null
    : null;
  const preBarber =
    preService && initialBarberName
      ? barbers.find(
          (b) =>
            b.name === initialBarberName &&
            !(exclusions[preService.name] ?? []).includes(b.name),
        ) ?? null
      : null;

  const [step, setStep] = useState(preService ? (preBarber ? 2 : 1) : 0);
  const [service, setService] = useState<WizService | null>(preService);
  const [barber, setBarber] = useState<WizBarber | null>(preBarber);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmLinks, setConfirmLinks] = useState<{
    portalUrl?: string;
    cancelUrl?: string;
  }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slotsByDate, setSlotsByDate] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  // Hvilken dag som vises i tid-steget (selve valget settes først når man
  // trykker et klokkeslett → date + time).
  const [viewDay, setViewDay] = useState("");

  // Neste åpne dager som klikkbare chips (hopper over stengte ukedager).
  const openDays = useMemo(() => {
    const closed = new Set(closedWeekdays);
    const out: { iso: string; weekday: string; dayNum: string; month: string }[] =
      [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; out.length < 14 && i < 90; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      if (closed.has(day.getDay())) continue;
      out.push({
        iso: isoDate(day),
        weekday: day.toLocaleDateString("nb-NO", { weekday: "short" }),
        dayNum: String(day.getDate()),
        month: day.toLocaleDateString("nb-NO", { month: "short" }),
      });
    }
    return out;
  }, [closedWeekdays]);
  const cats = useMemo(
    () => Array.from(new Set(services.map((s) => s.category))),
    [services],
  );
  // Trekkspill: hvilken kategori som er åpen (første åpen som standard).
  const [openCat, setOpenCat] = useState<string | null>(
    () => services[0]?.category ?? null,
  );
  // «fra {pris}» når prisen varierer mellom nivåer, ellers fast pris.
  const priceFrom = (name: string, fallback: string) => {
    const lv = levelPrices[name];
    const vals = lv ? Object.values(lv) : [];
    if (vals.length) {
      const min = Math.round(Math.min(...vals));
      const varies = vals.some((v) => Math.round(v) !== min);
      return varies ? `fra ${min} kr` : `${min} kr`;
    }
    return fallback;
  };

  // Barbere som IKKE er ekskludert for valgt tjeneste (alle uten unntak vises).
  const availableBarbers = useMemo(() => {
    if (!service) return barbers;
    const excluded = new Set(exclusions[service.name] ?? []);
    return barbers.filter((b) => !excluded.has(b.name));
  }, [barbers, exclusions, service]);

  // Nullstill valgt barber hvis den blir ekskludert av (ny) valgt tjeneste.
  useEffect(() => {
    if (barber && !availableBarbers.some((b) => b.name === barber.name)) {
      setBarber(null);
    }
  }, [availableBarbers, barber]);

  // Pris som vises: nivåpris når barber (med nivå + satt nivåpris) er valgt,
  // ellers tjenestens basispris. Speiler prisen create_booking faktisk setter.
  const priceLabel = useMemo(() => {
    if (service && barber) {
      const slug = barberLevels[barber.name];
      const lv = slug ? levelPrices[service.name]?.[slug] : undefined;
      if (typeof lv === "number") return `${Math.round(lv)} kr`;
    }
    return service?.price ?? "";
  }, [service, barber, barberLevels, levelPrices]);

  // Hent ledige tider for HELE perioden i ETT kall når barber + tjeneste er valgt
  // (i stedet for ett kall per dag). Da vises tidene med én gang man bytter dag.
  useEffect(() => {
    let active = true;
    if (step === 2 && barber && service && openDays.length > 0) {
      const from = openDays[0].iso;
      const to = openDays[openDays.length - 1].iso;
      setLoadingSlots(true);
      setSlotsError(false);
      getAvailableSlotsRange(barber.name, service.name, from, to).then((res) => {
        if (active) {
          setSlotsByDate(res.byDate);
          setSlotsError(!!res.error);
          setLoadingSlots(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [step, barber, service, openDays]);

  // Vis kun hele og halve timer (09:00, 09:30 …) – enklere valg for kunden.
  const halfHourSlots = (iso: string): string[] =>
    (slotsByDate[iso] ?? []).filter((t) => {
      const m = t.slice(3, 5);
      return m === "00" || m === "30";
    });

  // Hold «vist dag» på en dag som faktisk har ledige tider.
  useEffect(() => {
    if (step !== 2) return;
    const hasSlots = (iso: string) => halfHourSlots(iso).length > 0;
    if (viewDay && hasSlots(viewDay)) return;
    const firstWithSlots = openDays.find((d) => hasSlots(d.iso));
    setViewDay(firstWithSlots?.iso ?? openDays[0]?.iso ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, slotsByDate, openDays]);

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
      source,
      marketingConsent,
      price: priceLabel,
    });
    setPending(false);
    if (res?.error) setError(res.error);
    else {
      setConfirmLinks({ portalUrl: res.portalUrl, cancelUrl: res.cancelUrl });
      setDone(true);
    }
  }

  if (done) {
    const durMin = parseInt(service?.duration ?? "", 10) || 30;
    const start = new Date(`${date}T${time}:00`);
    const cal =
      service && !Number.isNaN(start.getTime())
        ? eventLinks({
            title: `Downtown Barbers – ${service.name}`,
            start,
            durationMin: durMin,
            description: barber ? `Hos ${barber.name}` : undefined,
          })
        : null;
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <p className="font-display text-3xl font-bold text-fg">Takk! 💈</p>
        <p className="mt-4 text-muted">
          Timen din er bekreftet: <strong className="text-fg">{service?.name}</strong> hos{" "}
          <strong className="text-fg">{barber?.name}</strong>
          <br />
          {date} kl. {time}
        </p>

        {cal && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Legg til i kalender
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={cal.icsHref}
                download="downtown-barbers.ics"
                className="rounded-md border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
              >
                Apple / Outlook (.ics)
              </a>
              <a
                href={cal.googleHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
              >
                Google Kalender
              </a>
            </div>
          </div>
        )}

        {(confirmLinks.portalUrl || confirmLinks.cancelUrl) && (
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            {confirmLinks.portalUrl && (
              <a
                href={confirmLinks.portalUrl}
                className="font-semibold text-accent-soft hover:underline"
              >
                Min side →
              </a>
            )}
            {confirmLinks.cancelUrl && (
              <a
                href={confirmLinks.cancelUrl}
                className="text-muted hover:text-fg"
              >
                Avbestill timen
              </a>
            )}
          </div>
        )}

        <p className="mt-6 text-sm text-muted">Vi sender også en bekreftelse på e-post.</p>
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
              "flex-1 px-2 py-3 text-center text-[10px] tracking-tight font-semibold uppercase sm:px-3 sm:text-xs sm:tracking-wide " +
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
          <div className="space-y-2.5">
            {cats.map((cat) => {
              const open = openCat === cat;
              const items = services.filter((s) => s.category === cat);
              return (
                <div key={cat} className="border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpenCat(open ? null : cat)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                  >
                    <span className="font-display text-base font-bold text-fg">
                      {cat}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      className={
                        "h-4 w-4 text-muted transition-transform duration-300 " +
                        (open ? "rotate-180" : "")
                      }
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path
                        d="m6 9 6 6 6-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-line p-4">
                      {items.map((s) => (
                        <div
                          key={s.name}
                          className={
                            "border p-4 transition-colors " +
                            (service?.name === s.name
                              ? "border-accent-soft bg-accent-soft/5"
                              : "border-line")
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-fg">{s.name}</p>
                              <p className="mt-0.5 text-xs text-muted italic">
                                ~{s.duration}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setService(s);
                                setStep(1);
                              }}
                              className="shrink-0 border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft hover:text-accent-soft"
                            >
                              + Velg
                            </button>
                          </div>
                          {s.description && (
                            <p className="mt-2 text-sm leading-relaxed text-muted">
                              {s.description}
                            </p>
                          )}
                          <p className="mt-2.5 font-display text-sm font-bold text-fg">
                            {priceFrom(s.name, s.price)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 1 && availableBarbers.length === 0 && (
          <p className="text-sm text-muted">
            Ingen barbere tilgjengelig for denne tjenesten. Velg en annen
            tjeneste.
          </p>
        )}

        {step === 1 && availableBarbers.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {availableBarbers.map((b) => (
              <button
                key={b.name}
                onClick={() => {
                  setBarber(b);
                  setStep(2);
                }}
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <label className="block text-xs font-semibold tracking-wide text-muted uppercase">
                Velg dag og tid {service ? `· ${service.duration}` : ""}
              </label>
              <span className="text-[11px] text-muted">
                Velg dag, så klokkeslett
              </span>
            </div>

            {openDays.length === 0 ? (
              <p className="text-sm text-muted">
                Ingen åpne dager tilgjengelig akkurat nå.
              </p>
            ) : loadingSlots ? (
              <p className="text-sm text-muted">Henter ledige tider …</p>
            ) : slotsError ? (
              <p className="text-sm text-danger">
                Kunne ikke hente ledige tider akkurat nå. Prøv igjen om litt,
                eller last inn siden på nytt.
              </p>
            ) : openDays.every((d) => halfHourSlots(d.iso).length === 0) ? (
              <p className="text-sm text-muted">
                Ingen ledige tider i perioden (stengt eller fullt). Prøv en
                annen barber eller tjeneste.
              </p>
            ) : (
              <>
                {/* Dag-velger (horisontal) */}
                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2 px-1">
                    {openDays.map((d) => {
                      const count = halfHourSlots(d.iso).length;
                      const isView = viewDay === d.iso;
                      const empty = count === 0;
                      return (
                        <button
                          key={d.iso}
                          onClick={() => !empty && setViewDay(d.iso)}
                          disabled={empty}
                          className={
                            "flex w-[62px] shrink-0 flex-col items-center rounded-md border px-1 py-2 transition-colors " +
                            (isView
                              ? "border-accent-soft bg-accent-soft/10"
                              : empty
                                ? "border-line opacity-35"
                                : "border-line hover:border-line-2")
                          }
                        >
                          <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
                            {d.weekday}
                          </span>
                          <span className="font-display text-lg font-bold text-fg">
                            {d.dayNum}
                          </span>
                          <span className="text-[10px] text-muted">{d.month}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tider for valgt dag – kompakt rutenett (hele + halve timer) */}
                {(() => {
                  const times = halfHourSlots(viewDay);
                  if (times.length === 0) {
                    return (
                      <p className="text-sm text-muted">
                        Ingen ledige tider denne dagen – velg en annen.
                      </p>
                    );
                  }
                  return (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {times.map((t) => {
                        const active = date === viewDay && time === t;
                        return (
                          <button
                            key={t}
                            onClick={() => {
                              setDate(viewDay);
                              setTime(t);
                            }}
                            className={
                              "rounded-md border py-2 text-sm tabular-nums transition-colors " +
                              (active
                                ? "border-accent-soft bg-accent-soft/15 font-semibold text-fg"
                                : "border-line text-fg-soft hover:border-accent-soft hover:text-fg")
                            }
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="mb-2 border border-line bg-surface-2 p-4 text-sm text-muted">
              <strong className="text-fg">{service?.name}</strong> ({service?.duration}) hos{" "}
              <strong className="text-fg">{barber?.name}</strong> · {date} kl. {time} ·{" "}
              <span className="text-fg">{priceLabel}</span>
            </div>
            <input
              placeholder="Fullt navn"
              aria-label="Fullt navn"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
            />
            <div>
              <input
                placeholder="E-post"
                aria-label="E-post"
                type="email"
                autoComplete="email"
                inputMode="email"
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
                aria-label="Telefon"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
              />
              {phone && !phoneOk && (
                <p className="mt-1 text-xs text-danger">Ugyldig norsk telefonnummer.</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Hvordan hørte du om oss? <span className="text-muted">(valgfritt)</span>
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
              >
                <option value="">Velg …</option>
                <option value="Anbefalt av venn/kunde">Anbefalt av venn/kunde</option>
                <option value="Google">Google-søk</option>
                <option value="Instagram / sosiale medier">Instagram / sosiale medier</option>
                <option value="Gikk forbi / skilt">Gikk forbi / skilt</option>
                <option value="Annet">Annet</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent-soft"
              />
              <span>
                Ja, jeg vil motta tilbud og nyheter fra Downtown Barbers på
                e-post/SMS <span className="text-muted">(valgfritt)</span>
              </span>
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            {!pending && (!name.trim() || !emailOk || !phoneOk) && (
              <p className="text-xs text-muted">
                Fyll inn{" "}
                {[
                  !name.trim() ? "navn" : null,
                  !emailOk ? "gyldig e-post" : null,
                  !phoneOk ? "gyldig telefon" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}{" "}
                for å bekrefte bookingen.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line p-4">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-4 py-2 text-sm"
        >
          Tilbake
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => canNext && setStep((s) => s + 1)}
            disabled={!canNext}
            className="px-6 py-2.5 text-sm"
          >
            Neste
          </Button>
        ) : (
          <Button
            onClick={submit}
            disabled={pending || !name.trim() || !emailOk || !phoneOk}
            className="px-6 py-2.5 text-sm"
          >
            {pending ? "Bekrefter …" : "Bekreft booking"}
          </Button>
        )}
      </div>
    </div>
  );
}
