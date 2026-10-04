"use client";

import { useEffect, useMemo, useState } from "react";
import { getCartSlots, createBookingGroup } from "@/app/booking/cart-actions";
import { isValidEmail, isValidNorwegianPhone } from "@/lib/validate";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export type WizService = {
  name: string;
  price: string;
  duration: string;
  category: string;
  description?: string;
};
export type WizBarber = { name: string; title: string };
export type WizAddon = { name: string; price: number; durationMin: number };

const STEP_KEYS = ["step.services", "step.time", "step.contact"];

const COUNTRY_CODES: [string, string][] = [
  ["+47", "NO"], ["+46", "SE"], ["+45", "DK"], ["+358", "FI"], ["+354", "IS"],
  ["+44", "UK"], ["+48", "PL"], ["+49", "DE"], ["+33", "FR"], ["+34", "ES"],
  ["+39", "IT"], ["+31", "NL"], ["+1", "US"],
];

const ANY = "__any__";

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const durMin = (s: string) => parseInt(s, 10) || 30;
const nok = (n: number) => `${Math.round(n)} kr`;

type CartItem = {
  id: number;
  service: WizService;
  barberName: string | null; // null = hvilken som helst (gruppe-modus)
  person: string;
  addons: string[]; // add-on navn
};

export function BookingWizard({
  services,
  barbers,
  addons = [],
  exclusions = {},
  levelPrices = {},
  barberLevels = {},
  closedWeekdays = [],
  initialServiceName,
}: {
  services: WizService[];
  barbers: WizBarber[];
  addons?: WizAddon[];
  exclusions?: Record<string, string[]>;
  levelPrices?: Record<string, Record<string, number>>;
  barberLevels?: Record<string, string>;
  closedWeekdays?: number[];
  initialServiceName?: string;
  initialBarberName?: string;
}) {
  const { lang, t } = useLanguage();
  const locale = lang === "en" ? "en-GB" : "nb-NO";

  const cats = useMemo(
    () => Array.from(new Set(services.map((s) => s.category))),
    [services],
  );
  const [openCat, setOpenCat] = useState<string | null>(
    () => services[0]?.category ?? null,
  );

  const [step, setStep] = useState(0);
  const [cart, setCart] = useState<CartItem[]>(() => {
    const pre = initialServiceName
      ? services.find((s) => s.name === initialServiceName)
      : null;
    return pre
      ? [{ id: 1, service: pre, barberName: null, person: "", addons: [] }]
      : [];
  });
  const [nextId, setNextId] = useState(2);
  const [mode, setMode] = useState<"single" | "group">("single");
  // Barber for hele besøket i «én person»-modus (ANY = hvilken som helst).
  const [singleBarber, setSingleBarber] = useState<string>(ANY);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [viewDay, setViewDay] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+47");
  const [source, setSource] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);

  const [done, setDone] = useState(false);
  const [confirmLinks, setConfirmLinks] = useState<{ portalUrl?: string; cancelUrl?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slotsByDate, setSlotsByDate] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);

  const addonByName = useMemo(() => {
    const m = new Map<string, WizAddon>();
    addons.forEach((a) => m.set(a.name, a));
    return m;
  }, [addons]);

  // Åpne dager (neste ~21 dager, hopp over stengte ukedager).
  const openDays = useMemo(() => {
    const out: { iso: string; weekday: string; dayNum: string; month: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 28 && out.length < 21; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() + i);
      if (closedWeekdays.includes(day.getDay())) continue;
      out.push({
        iso: isoDate(day),
        weekday: day.toLocaleDateString(locale, { weekday: "short" }),
        dayNum: String(day.getDate()),
        month: day.toLocaleDateString(locale, { month: "short" }),
      });
    }
    return out;
  }, [closedWeekdays, locale]);

  // ---- Priser --------------------------------------------------------------
  const serviceMinPrice = (name: string) => {
    const lv = levelPrices[name];
    const vals = lv ? Object.values(lv) : [];
    if (vals.length) return Math.min(...vals);
    return parseInt(services.find((s) => s.name === name)?.price ?? "", 10) || 0;
  };
  const serviceExactPrice = (name: string, barber: string | null) => {
    if (!barber || barber === ANY) return null;
    const slug = barberLevels[barber];
    const p = slug ? levelPrices[name]?.[slug] : undefined;
    return typeof p === "number" ? p : null;
  };
  const addonsSum = (names: string[]) =>
    names.reduce((s, n) => s + (addonByName.get(n)?.price ?? 0), 0);
  const addonsMinutes = (names: string[]) =>
    names.reduce((s, n) => s + (addonByName.get(n)?.durationMin ?? 0), 0);

  const lineBarber = (it: CartItem) =>
    mode === "single" ? (singleBarber === ANY ? null : singleBarber) : it.barberName;

  const linePrice = (it: CartItem) => {
    const b = lineBarber(it);
    const exact = serviceExactPrice(it.service.name, b);
    const svc = exact ?? serviceMinPrice(it.service.name);
    return { value: svc + addonsSum(it.addons), exact: exact != null };
  };
  const cartTotal = cart.reduce((s, it) => s + linePrice(it).value, 0);
  const anyEstimate = cart.some((it) => !linePrice(it).exact);

  // Barbere som kan ta tjenesten (ikke ekskludert).
  const barbersFor = (serviceName: string) => {
    const ex = new Set(exclusions[serviceName] ?? []);
    return barbers.filter((b) => !ex.has(b.name));
  };
  // Barbere som kan ta ALLE tjenestene i kurven (for «én person»).
  const barbersForAll = useMemo(() => {
    return barbers.filter((b) =>
      cart.every((it) => !(exclusions[it.service.name] ?? []).includes(b.name)),
    );
  }, [barbers, cart, exclusions]);

  // ---- Kurv-operasjoner ----------------------------------------------------
  const addToCart = (service: WizService) => {
    setCart((c) => [...c, { id: nextId, service, barberName: null, person: "", addons: [] }]);
    setNextId((n) => n + 1);
  };
  const removeLine = (id: number) => setCart((c) => c.filter((l) => l.id !== id));
  const patchLine = (id: number, patch: Partial<CartItem>) =>
    setCart((c) => c.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const toggleAddon = (id: number, name: string) =>
    setCart((c) =>
      c.map((l) =>
        l.id === id
          ? {
              ...l,
              addons: l.addons.includes(name)
                ? l.addons.filter((a) => a !== name)
                : [...l.addons, name],
            }
          : l,
      ),
    );

  // Kurv → input til server (ledige tider / oppretting).
  const cartLines = useMemo(
    () =>
      cart.map((it) => ({
        serviceName: it.service.name,
        serviceMinutes: durMin(it.service.duration),
        addonMinutes: addonsMinutes(it.addons),
        addonNames: it.addons,
        barberName: lineBarber(it),
        person: it.person,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, mode, singleBarber],
  );

  const groupNeedsBarbers =
    mode === "group" && cart.some((it) => !it.barberName);
  const canGoTid = cart.length > 0 && !groupNeedsBarbers;

  // ---- Hent ledige tider når man går til Tid-steget ------------------------
  useEffect(() => {
    if (step !== 1 || cart.length === 0 || openDays.length === 0) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(false);
    const from = openDays[0].iso;
    const to = openDays[openDays.length - 1].iso;
    getCartSlots(cartLines, mode, from, to)
      .then((res) => {
        if (cancelled) return;
        if (res.error) setSlotsError(true);
        setSlotsByDate(res.byDate ?? {});
        const firstWithSlots = openDays.find((d) => (res.byDate?.[d.iso] ?? []).length > 0);
        setViewDay(firstWithSlots?.iso ?? openDays[0]?.iso ?? "");
      })
      .catch(() => !cancelled && setSlotsError(true))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const halfHourSlots = (iso: string) =>
    (slotsByDate[iso] ?? []).filter((t) => t.endsWith(":00") || t.endsWith(":30"));

  const emailOk = isValidEmail(email);
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneOk =
    countryCode === "+47"
      ? isValidNorwegianPhone(phone)
      : phoneDigits.length >= 5 && phoneDigits.length <= 14;

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createBookingGroup({
      lines: cartLines,
      mode,
      date,
      time,
      name,
      email,
      phone: `${countryCode} ${phone.trim()}`,
      source,
      marketingConsent,
    });
    setPending(false);
    if (res?.error) setError(res.error);
    else {
      setConfirmLinks({ portalUrl: res.portalUrl, cancelUrl: res.cancelUrl });
      setDone(true);
    }
  }

  // ---- Suksess -------------------------------------------------------------
  if (done) {
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <p className="font-display text-3xl font-bold text-fg">{t("wiz.thanks")}</p>
        <p className="mt-4 text-muted">
          {t("wiz.confirmed")}
          <br />
          <strong className="text-fg">
            {cart.map((it) => it.service.name).join(" · ")}
          </strong>
          <br />
          {date} {t("common.at")} {time}
        </p>
        {(confirmLinks.portalUrl || confirmLinks.cancelUrl) && (
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            {confirmLinks.portalUrl && (
              <a href={confirmLinks.portalUrl} className="font-semibold text-accent-soft hover:underline">
                {t("wiz.myPage")}
              </a>
            )}
            {confirmLinks.cancelUrl && (
              <a href={confirmLinks.cancelUrl} className="text-muted hover:text-fg">
                {t("wiz.cancel")}
              </a>
            )}
          </div>
        )}
        <p className="mt-6 text-sm text-muted">{t("wiz.emailConfirm")}</p>
      </div>
    );
  }

  return (
    <div className="border border-line bg-surface">
      {/* Steg-faner */}
      <div className="flex border-b border-line">
        {STEP_KEYS.map((s, i) => (
          <div
            key={s}
            className={
              "flex-1 px-2 py-3 text-center text-[10px] tracking-tight font-semibold uppercase sm:px-3 sm:text-xs sm:tracking-wide " +
              (i === step ? "bg-accent text-accent-fg" : i < step ? "text-accent-soft" : "text-muted")
            }
          >
            {i + 1}. {t(s)}
          </div>
        ))}
      </div>

      <div className="p-6">
        {/* ======================= STEG 0: TJENESTER + KURV ================= */}
        {step === 0 && (
          <div className="space-y-6">
            {/* Trekkspill med tjenester */}
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
                      <span className="font-display text-base font-bold text-fg">{cat}</span>
                      <svg
                        viewBox="0 0 24 24"
                        className={"h-4 w-4 text-muted transition-transform duration-300 " + (open ? "rotate-180" : "")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div
                      className={
                        "grid transition-all duration-300 ease-out " +
                        (open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")
                      }
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-3 border-t border-line p-4">
                          {items.map((s) => (
                            <div key={s.name} className="border border-line p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-fg">{s.name}</p>
                                  <p className="mt-0.5 text-xs text-muted italic">~{s.duration}</p>
                                </div>
                                <button
                                  onClick={() => addToCart(s)}
                                  className="shrink-0 border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft hover:text-accent-soft"
                                >
                                  {t("wiz.add")}
                                </button>
                              </div>
                              {s.description && (
                                <p className="mt-2 text-sm leading-relaxed text-muted">{s.description}</p>
                              )}
                              <p className="mt-2.5 font-display text-sm font-bold text-fg">
                                {serviceMinPrice(s.name) ===
                                Math.max(...(levelPrices[s.name] ? Object.values(levelPrices[s.name]) : [serviceMinPrice(s.name)]))
                                  ? nok(serviceMinPrice(s.name))
                                  : `${t("common.from")}${nok(serviceMinPrice(s.name))}`}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Kurv */}
            {cart.length === 0 ? (
              <p className="text-sm text-muted">{t("wiz.emptyCart")}</p>
            ) : (
              <div className="space-y-4 border border-line-2 bg-canvas p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-fg">{t("wiz.yourCart")}</h3>
                  <span className="text-sm text-muted">
                    {anyEstimate ? t("common.from") : ""}
                    {nok(cartTotal)}
                  </span>
                </div>

                {/* Modus-bryter (kun relevant med flere linjer) */}
                {cart.length > 1 && (
                  <div className="flex overflow-hidden rounded-md border border-line-2 text-xs font-semibold">
                    <button
                      onClick={() => setMode("single")}
                      className={"flex-1 px-3 py-2 " + (mode === "single" ? "bg-accent text-accent-fg" : "text-muted")}
                    >
                      {t("wiz.modeSingle")}
                    </button>
                    <button
                      onClick={() => setMode("group")}
                      className={"flex-1 px-3 py-2 " + (mode === "group" ? "bg-accent text-accent-fg" : "text-muted")}
                    >
                      {t("wiz.modeGroup")}
                    </button>
                  </div>
                )}

                {/* Felles barber i «én person»-modus */}
                {mode === "single" && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">
                      {t("wiz.barberForVisit")}
                    </label>
                    <select
                      value={singleBarber}
                      onChange={(e) => setSingleBarber(e.target.value)}
                      className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
                    >
                      <option value={ANY}>{t("wiz.anyBarber")}</option>
                      {barbersForAll.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} · {b.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Linjer */}
                <div className="space-y-3">
                  {cart.map((it, idx) => (
                    <div key={it.id} className="border border-line bg-surface p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-fg">{it.service.name}</p>
                          <p className="text-xs text-muted">~{it.service.duration}</p>
                        </div>
                        <button
                          onClick={() => removeLine(it.id)}
                          className="shrink-0 text-xs text-muted hover:text-danger"
                        >
                          {t("wiz.remove")}
                        </button>
                      </div>

                      {/* Gruppe-modus: barber + person per linje */}
                      {mode === "group" && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <select
                            value={it.barberName ?? ""}
                            onChange={(e) => patchLine(it.id, { barberName: e.target.value || null })}
                            className="border border-line-2 bg-canvas px-2 py-2 text-sm text-fg outline-none focus:border-accent-soft"
                          >
                            <option value="">{t("wiz.chooseBarber")}</option>
                            {barbersFor(it.service.name).map((b) => (
                              <option key={b.name} value={b.name}>
                                {b.name} · {b.title}
                              </option>
                            ))}
                          </select>
                          <input
                            value={it.person}
                            onChange={(e) => patchLine(it.id, { person: e.target.value })}
                            placeholder={`${t("wiz.personName")} (${t("wiz.person")} ${idx + 1})`}
                            className="border border-line-2 bg-canvas px-2 py-2 text-sm text-fg outline-none focus:border-accent-soft"
                          />
                        </div>
                      )}

                      {/* Tillegg */}
                      {addons.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                            {t("wiz.addonsLabel")}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {addons.map((a) => {
                              const on = it.addons.includes(a.name);
                              return (
                                <button
                                  key={a.name}
                                  onClick={() => toggleAddon(it.id, a.name)}
                                  className={
                                    "rounded-full border px-3 py-1 text-xs transition-colors " +
                                    (on
                                      ? "border-accent-soft bg-accent-soft/15 text-fg"
                                      : "border-line-2 text-muted hover:border-accent-soft")
                                  }
                                >
                                  {on ? "✓ " : "+ "}
                                  {a.name} ({nok(a.price)})
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <p className="mt-2.5 text-right font-display text-sm font-bold text-fg">
                        {linePrice(it).exact ? "" : t("common.from")}
                        {nok(linePrice(it).value)}
                      </p>
                    </div>
                  ))}
                </div>

                {groupNeedsBarbers && (
                  <p className="text-xs text-danger">{t("wiz.needBarbers")}</p>
                )}

                <button
                  onClick={() => canGoTid && setStep(1)}
                  disabled={!canGoTid}
                  className="w-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {t("wiz.chooseTime")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================= STEG 1: TID ============================== */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold tracking-wide text-muted uppercase">
                {t("wiz.chooseDayTime")}
              </label>
              <button onClick={() => setStep(0)} className="text-xs text-accent-soft hover:underline">
                {t("wiz.editCart")}
              </button>
            </div>

            {openDays.length === 0 ? (
              <p className="text-sm text-muted">{t("wiz.noOpenDays")}</p>
            ) : loadingSlots ? (
              <p className="text-sm text-muted">{t("wiz.loadingSlots")}</p>
            ) : slotsError ? (
              <p className="text-sm text-danger">
                {t("wiz.slotsError")}
              </p>
            ) : openDays.every((d) => halfHourSlots(d.iso).length === 0) ? (
              <p className="text-sm text-muted">
                {t("wiz.noSlotsPeriod")}
              </p>
            ) : (
              <>
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
                          <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">{d.weekday}</span>
                          <span className="font-display text-lg font-bold text-fg">{d.dayNum}</span>
                          <span className="text-[10px] text-muted">{d.month}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const times = halfHourSlots(viewDay);
                  if (times.length === 0)
                    return <p className="text-sm text-muted">{t("wiz.noSlotsDay")}</p>;
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
                                : "border-line text-muted hover:border-line-2 hover:text-fg")
                            }
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                <button
                  onClick={() => date && time && setStep(2)}
                  disabled={!date || !time}
                  className="w-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {t("wiz.toContact")}
                </button>
              </>
            )}
          </div>
        )}

        {/* ======================= STEG 2: KONTAKT ========================== */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold tracking-wide text-muted uppercase">
                {t("wiz.yourDetails")}
              </label>
              <button onClick={() => setStep(1)} className="text-xs text-accent-soft hover:underline">
                {t("wiz.editTime")}
              </button>
            </div>

            <div className="border border-line-2 bg-canvas p-3 text-sm">
              <p className="text-fg">
                <strong>{cart.map((it) => it.service.name).join(" · ")}</strong>
              </p>
              <p className="mt-1 text-muted">
                {date} {t("common.at")} {time} · {anyEstimate ? t("common.from") : ""}
                {nok(cartTotal)}
              </p>
            </div>

            <input
              placeholder={t("wiz.fullName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
            />
            <div>
              <input
                placeholder={t("wiz.email")}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
              />
              {email && !emailOk && <p className="mt-1 text-xs text-danger">{t("wiz.invalidEmail")}</p>}
            </div>
            <div>
              <div className="flex gap-2">
                <select
                  aria-label={t("wiz.countryCode")}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="shrink-0 border border-line-2 bg-canvas px-2 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
                >
                  {COUNTRY_CODES.map(([code, abbr]) => (
                    <option key={code} value={code}>
                      {code} {abbr}
                    </option>
                  ))}
                </select>
                <input
                  placeholder={t("wiz.phone")}
                  aria-label={t("wiz.phoneAria")}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
                />
              </div>
              {phone && !phoneOk && <p className="mt-1 text-xs text-danger">{t("wiz.invalidPhone")}</p>}
            </div>

            <input
              placeholder={t("wiz.source")}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
            />

            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t("wiz.marketingConsent")}</span>
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              onClick={submit}
              disabled={pending || !name.trim() || !emailOk || !phoneOk}
              className="w-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? t("wiz.booking") : t("wiz.confirm")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
