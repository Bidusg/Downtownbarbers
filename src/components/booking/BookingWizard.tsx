"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCartSlots, createBookingGroup, findNextCartSlot } from "@/app/booking/cart-actions";
import { isValidEmail, isValidNorwegianPhone } from "@/lib/validate";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { translateContent } from "@/lib/i18n/content-map";

export type WizService = {
  name: string;
  price: string;
  duration: string;
  category: string;
  description?: string;
};
export type WizBarber = { name: string; display?: string; title: string; photo?: string | null };
export type WizAddon = { name: string; price: number; durationMin: number };

/**
 * Prislapp: oransje «badge» så prisen er lett å få øye på i veiviseren.
 * `from` legger på «fra» i liten tekst (nivåpris varierer med barber).
 */
function PriceTag({
  value,
  from = false,
  size = "md",
  fromLabel,
}: {
  value: number;
  from?: boolean;
  size?: "sm" | "md" | "lg";
  fromLabel: string;
}) {
  const pad = size === "lg" ? "px-3.5 py-1.5" : size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const amt = size === "lg" ? "text-lg" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <span
      className={
        "inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-accent-soft/50 bg-accent-soft/12 " +
        pad
      }
    >
      {from && (
        <span className="text-[10px] font-semibold tracking-[0.12em] text-accent-soft/80 uppercase">
          {fromLabel.trim()}
        </span>
      )}
      <span className={"font-display font-bold text-accent-soft " + amt}>{nok(value)}</span>
    </span>
  );
}

const STEP_KEYS = ["step.services", "step.barber", "step.time", "step.contact"];

const COUNTRY_CODES: [string, string][] = [
  ["+47", "NO"], ["+46", "SE"], ["+45", "DK"], ["+358", "FI"], ["+354", "IS"],
  ["+44", "UK"], ["+48", "PL"], ["+49", "DE"], ["+33", "FR"], ["+34", "ES"],
  ["+39", "IT"], ["+31", "NL"], ["+1", "US"],
];

const ANY = "__any__";

// «Hvordan hørte du om oss?» – faste valg slik at anbefaling-%-KPI-en kan telles.
// Verdien som lagres (source) er norsk og stabil uansett visningsspråk.
const SOURCE_OPTIONS: { value: string; key: string }[] = [
  { value: "Google", key: "wiz.source.google" },
  { value: "Sosiale medier", key: "wiz.source.social" },
  { value: "Anbefalt av venn/familie", key: "wiz.source.friend" },
  { value: "Gikk forbi", key: "wiz.source.walkby" },
  { value: "Fast kunde", key: "wiz.source.returning" },
  { value: "Annet", key: "wiz.source.other" },
];

const FIELD =
  "w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft";
const FIELD_LABEL = "mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase";

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
  initialBarberName,
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
  // Oversett DB-innhold (tjenester/kategorier/tillegg/titler); norsk fallback.
  // Tjenestenavn får et usynlig brytepunkt etter «/» («Maskinklipp/Lineup»),
  // så navnet brytes pent ved skråstreken på smale skjermer – ikke midt i ordet.
  const tc = (s: string) => translateContent("services", s, lang).replace(/\//g, "/\u200B");
  const tt = (s: string) => translateContent("titles", s, lang);
  // «Mandag 5. oktober kl. 14:00» i stedet for «2026-10-05 kl. 14:00».
  const fmtWhen = (iso: string, hhmm: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return `${iso} ${t("common.at")} ${hhmm}`;
    const label = new Date(y, m - 1, d).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${t("common.at")} ${hhmm}`;
  };


  // Kom kunden med en tjeneste valgt (fra prislista/«Book nå»)? Da er steg 1
  // allerede gjort – start på Barber (eller Tid hvis barberen også er valgt).
  const [step, setStep] = useState(() => {
    const pre = initialServiceName && services.some((s) => s.name === initialServiceName);
    if (!pre) return 0;
    return initialBarberName && barbers.some((b) => b.name === initialBarberName) ? 2 : 1;
  });
  // «Legg til en tjeneste til»: da legger et trykk på en tjeneste den TIL i
  // stedet for å bytte ut den valgte. Standard er ett valg = én tjeneste.
  const [adding, setAdding] = useState(false);
  const [showNote, setShowNote] = useState(false);
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
  const [singleBarber, setSingleBarber] = useState<string>(() =>
    initialBarberName && barbers.some((b) => b.name === initialBarberName)
      ? initialBarberName
      : ANY,
  );

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [viewDay, setViewDay] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+47");
  const [source, setSource] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [note, setNote] = useState("");
  // Honeypot-felt (skal alltid være tomt for ekte kunder).
  const [website, setWebsite] = useState("");
  // Husk navn/e-post/telefon på denne enheten → faste kunder slipper å skrive alt på nytt.
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dtb_booker");
      if (!raw) return;
      const v = JSON.parse(raw) as { name?: string; email?: string; phone?: string; cc?: string };
      // Les lagrede opplysninger etter hydrering (localStorage finnes ikke på serveren).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v.name) setName(v.name);
      if (v.email) setEmail(v.email);
      if (v.phone) setPhone(v.phone);
      if (v.cc) setCountryCode(v.cc);
      if (v.name || v.email) setRemembered(true);
    } catch {
      /* privat modus e.l. – helt greit */
    }
  }, []);
  const forgetMe = () => {
    try {
      localStorage.removeItem("dtb_booker");
    } catch {
      /* ignorer */
    }
    setName("");
    setEmail("");
    setPhone("");
    setCountryCode("+47");
    setRemembered(false);
  };
  /** Rull toppen av veiviseren inn i bildet ved stegbytte (viktig på mobil). */
  function scrollWizardTop() {
    requestAnimationFrame(() =>
      document.getElementById("booking-wizard")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  const goStep = (n: number) => {
    setStep(n);
    scrollWizardTop();
  };

  const [done, setDone] = useState(false);
  const [confirmLinks, setConfirmLinks] = useState<{ portalUrl?: string; cancelUrl?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slotsByDate, setSlotsByDate] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  // Hvor langt frem (kalenderdager) dagvelgeren viser. Utvides av «Finn neste
  // ledige tid» hvis første ledige tid ligger lenger frem.
  const [horizon, setHorizon] = useState(28);
  // Tid som skal velges når de nye tidene er hentet (etter utvidelse).
  const [jumpTo, setJumpTo] = useState<{ date: string; time: string } | null>(null);
  const [findingNext, setFindingNext] = useState(false);
  const [nextMsg, setNextMsg] = useState<string | null>(null);

  const addonByName = useMemo(() => {
    const m = new Map<string, WizAddon>();
    addons.forEach((a) => m.set(a.name, a));
    return m;
  }, [addons]);

  // Åpne dager (neste ~21 dager, hopp over stengte ukedager).
  const openDays = useMemo(() => {
    const out: { iso: string; weekday: string; dayNum: string; month: string }[] = [];
    const today = new Date();
    for (let i = 0; i < horizon; i++) {
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
  }, [closedWeekdays, locale, horizon]);

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
  /**
   * Ett trykk på en tjeneste = valgt, og vi går rett videre.
   *  - Vanlig: erstatter det som var valgt (ombestemmer seg → bare trykk en annen,
   *    ingenting å fjerne, ingen kurv som vokser i det skjulte).
   *  - «Legg til en tjeneste til» (adding): legges til ved siden av.
   */
  const pickService = (service: WizService) => {
    if (adding && cart.length > 0) {
      setCart((c) => [...c, { id: nextId, service, barberName: null, person: "", addons: [] }]);
      setAdding(false);
    } else {
      setCart([{ id: nextId, service, barberName: null, person: "", addons: [] }]);
      setMode("single");
    }
    setNextId((n) => n + 1);
    // Liten pause så kunden ser at valget «tok», før neste steg vises.
    window.setTimeout(() => {
      setStep(preBarberFor(service) ? 2 : 1);
      scrollWizardTop();
    }, 180);
  };
  // Brukes til å hoppe over Barber-steget når barberen er valgt fra før.
  const preBarberFor = (service: WizService) =>
    !!initialBarberName &&
    singleBarber === initialBarberName &&
    !adding &&
    !(exclusions[service.name] ?? []).includes(initialBarberName);
  const removeLine = (id: number) =>
    setCart((c) => {
      const next = c.filter((l) => l.id !== id);
      if (next.length === 0) setStep(0); // tom → tilbake til tjenestevalg
      return next;
    });
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
    if (step !== 2 || cart.length === 0 || openDays.length === 0) return;
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
        if (jumpTo && (res.byDate?.[jumpTo.date] ?? []).includes(jumpTo.time)) {
          showSlot(jumpTo.date, jumpTo.time);
          setJumpTo(null);
          return;
        }
        const firstWithSlots = openDays.find((d) => (res.byDate?.[d.iso] ?? []).length > 0);
        setViewDay(firstWithSlots?.iso ?? openDays[0]?.iso ?? "");
      })
      .catch(() => !cancelled && setSlotsError(true))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, horizon]);

  /** Vis og velg en bestemt tid (dag + klokkeslett), og rull dagen frem. */
  function showSlot(d: string, tm: string) {
    setViewDay(d);
    setDate(d);
    setTime(tm);
    setNextMsg(null);
    requestAnimationFrame(() =>
      document.getElementById(`wiz-day-${d}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }),
    );
  }

  /** «Finn neste ledige tid»: først i det som er hentet, ellers lenger frem. */
  async function findNext() {
    setNextMsg(null);
    for (const d of openDays) {
      const first = halfHourSlots(d.iso)[0];
      if (first) return showSlot(d.iso, first);
    }
    if (openDays.length === 0) return;
    setFindingNext(true);
    try {
      const last = openDays[openDays.length - 1].iso;
      const next = new Date(last + "T12:00:00");
      next.setDate(next.getDate() + 1);
      const found = await findNextCartSlot(cartLines, mode, isoDate(next));
      if (!found) {
        setNextMsg(t("wiz.noNextSlot"));
        return;
      }
      // Utvid dagvelgeren så den funne dagen er med, og velg tiden når tidene er hentet.
      const days = Math.ceil(
        (new Date(found.date + "T12:00:00").getTime() - new Date(isoDate(new Date()) + "T12:00:00").getTime()) / 86400000,
      );
      setJumpTo(found);
      setHorizon(Math.max(horizon, days + 7));
    } catch {
      setNextMsg(t("wiz.slotsError"));
    } finally {
      setFindingNext(false);
    }
  }

  const halfHourSlots = (iso: string) =>
    (slotsByDate[iso] ?? []).filter((t) => t.endsWith(":00") || t.endsWith(":30"));

  const emailOk = isValidEmail(email);
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneOk =
    countryCode === "+47"
      ? isValidNorwegianPhone(phone)
      : phoneDigits.length >= 5 && phoneDigits.length <= 14;

  const canSubmit = !pending && !!name.trim() && emailOk && phoneOk;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
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
      note: note.trim() || undefined,
      website,
    });
    setPending(false);
    if (res?.error) setError(res.error);
    else {
      try {
        localStorage.setItem(
          "dtb_booker",
          JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), cc: countryCode }),
        );
      } catch {
        /* ignorer */
      }
      setConfirmLinks({ portalUrl: res.portalUrl, cancelUrl: res.cancelUrl });
      setDone(true);
      scrollWizardTop();
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
            {cart.map((it) => tc(it.service.name)).join(" · ")}
          </strong>
          <br />
          {fmtWhen(date, time)}
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

  // Hovedlista: tilleggene (hårvask, massasje, voks) er ikke egne behandlinger –
  // de tilbys som «legg til» etter at hovedtjenesten er valgt.
  const addonNames = new Set(addons.map((a) => a.name));
  const mainServices = services.filter((s) => !addonNames.has(s.name));
  const mainCats = Array.from(new Set(mainServices.map((s) => s.category)));
  const selectedBarberObj =
    mode === "single" && singleBarber !== ANY ? barbers.find((b) => b.name === singleBarber) : undefined;

  /** Fast «tilbake»-lenke øverst til venstre – alltid på samme sted i hvert steg. */
  const backLink = (to: number, label: string) => (
    <button
      type="button"
      onClick={() => goStep(to)}
      className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );

  return (
    <div id="booking-wizard" className="scroll-mt-24 border border-line bg-surface">
      {/* Steg-faner – fullførte steg kan klikkes for å gå tilbake */}
      <ol className="flex border-b border-line" aria-label={t("wiz.goToStep")}>
        {STEP_KEYS.map((s, i) => {
          const cls =
            "flex-1 px-2 py-3 text-center text-[10px] tracking-tight font-semibold uppercase sm:px-3 sm:text-xs sm:tracking-wide " +
            (i === step ? "bg-accent text-accent-fg" : i < step ? "text-accent-soft" : "text-muted");
          return (
            <li key={s} className="flex flex-1" aria-current={i === step ? "step" : undefined}>
              {i < step ? (
                <button
                  type="button"
                  onClick={() => goStep(i)}
                  className={cls + " w-full hover:underline"}
                  aria-label={`${t("wiz.goToStep")} ${i + 1}: ${t(s)}`}
                >
                  {i < step ? "✓ " : `${i + 1}. `}
                  {t(s)}
                </button>
              ) : (
                <span className={cls + " block w-full"}>
                  {i + 1}. {t(s)}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="p-3 sm:p-6">
        {/* ======================= STEG 0: TJENESTE ========================= */}
        {step === 0 && (
          <div className="space-y-6">
            {adding && cart.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border border-accent-soft/50 bg-accent-soft/10 px-4 py-3 text-sm">
                <span className="text-fg">
                  {t("wiz.addingBanner")}{" "}
                  <strong>{cart.map((it) => tc(it.service.name)).join(", ")}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    goStep(1);
                  }}
                  className="text-xs font-semibold text-accent-soft hover:underline"
                >
                  {t("wiz.cancelAdd")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("wiz.pickOne")}</p>
            )}

            {mainCats.map((cat) => {
              const items = mainServices.filter((s) => s.category === cat);
              return (
                <div key={cat}>
                  <h3 className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                    {tc(cat)}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((s) => {
                      const selected = !adding && cart.length === 1 && cart[0].service.name === s.name;
                      const min = serviceMinPrice(s.name);
                      const max = Math.max(...(levelPrices[s.name] ? Object.values(levelPrices[s.name]) : [min]));
                      return (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => pickService(s)}
                          aria-pressed={selected}
                          className={
                            "group flex min-h-[72px] items-center gap-3 border px-4 py-3 text-left transition-colors " +
                            (selected
                              ? "border-accent-soft bg-accent-soft/10"
                              : "border-line hover:border-accent-soft/60 hover:bg-surface-2")
                          }
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold break-words text-fg">{tc(s.name)}</span>
                            <span className="mt-0.5 block text-xs text-muted">
                              ~{s.duration}
                              {s.description ? (
                                <span className="line-clamp-1"> {tc(s.description)}</span>
                              ) : null}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <PriceTag value={min} from={min !== max} fromLabel={t("common.from")} />
                            <span
                              className={
                                "text-[11px] font-semibold " +
                                (selected ? "text-accent-soft" : "text-muted group-hover:text-accent-soft")
                              }
                            >
                              {selected ? `✓ ${t("wiz.selected")}` : `${t("wiz.choose")} →`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ======================= STEG 1: BARBER (+ valgfrie tillegg) ======= */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              {backLink(0, t("wiz.changeService"))}
            </div>

            {/* Valgt tjeneste(r) – med tydelig, valgfritt tillegg og live pris */}
            <div className="space-y-3">
              {cart.map((it) => (
                <div key={it.id} className="border border-line-2 bg-canvas p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words text-fg">{tc(it.service.name)}</p>
                      <p className="text-xs text-muted">
                        ~{it.service.duration}
                        {it.addons.length > 0 && <> · + {it.addons.map(tc).join(", ")}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PriceTag value={linePrice(it).value} from={!linePrice(it).exact} size="sm" fromLabel={t("common.from")} />
                      {cart.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(it.id)}
                          aria-label={`${t("wiz.remove")} ${tc(it.service.name)}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-line-2 text-muted hover:border-danger hover:text-danger"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  {addons.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                        {t("wiz.addonsOptional")}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {addons.map((a) => {
                          const on = it.addons.includes(a.name);
                          return (
                            <button
                              key={a.name}
                              type="button"
                              onClick={() => toggleAddon(it.id, a.name)}
                              aria-pressed={on}
                              className={
                                "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                                (on
                                  ? "border-accent-soft bg-accent-soft/15 text-fg"
                                  : "border-line-2 text-muted hover:border-accent-soft")
                              }
                            >
                              {on ? "✓ " : "+ "}
                              {tc(a.name)}{" "}
                              <span className="font-semibold text-accent-soft">+{nok(a.price)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  goStep(0);
                }}
                className="text-xs font-semibold text-accent-soft hover:underline"
              >
                + {t("wiz.addAnother")}
              </button>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{t("wiz.whoCuts")}</p>

              {cart.length > 1 && (
                <div className="mb-3 flex overflow-hidden rounded-md border border-line-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setMode("single")}
                    className={"flex-1 px-3 py-2 " + (mode === "single" ? "bg-accent text-accent-fg" : "text-muted")}
                  >
                    {t("wiz.modeSingle")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("group")}
                    className={"flex-1 px-3 py-2 " + (mode === "group" ? "bg-accent text-accent-fg" : "text-muted")}
                  >
                    {t("wiz.modeGroup")}
                  </button>
                </div>
              )}

              {mode === "single" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {/* «Første ledige» først: raskest vei, og flest ledige tider */}
                  <button
                    type="button"
                    onClick={() => {
                      setSingleBarber(ANY);
                      window.setTimeout(() => goStep(2), 150);
                    }}
                    aria-pressed={singleBarber === ANY}
                    className={
                      "col-span-2 flex items-center gap-3 rounded-md border p-4 text-left transition-colors sm:col-span-3 " +
                      (singleBarber === ANY
                        ? "border-accent-soft bg-accent-soft/10"
                        : "border-accent-soft/50 hover:bg-accent-soft/10")
                    }
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-xl font-bold text-fg">
                      ✂
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{t("wiz.anyBarberHint")}</span>
                      <span className="block text-xs text-muted">{t("wiz.anyBarberWhy")}</span>
                    </span>
                    <span className="text-sm font-semibold text-accent-soft">→</span>
                  </button>
                  {barbersForAll.map((b) => {
                    const on = singleBarber === b.name;
                    const total = cart.reduce((sum, it) => {
                      const exact = serviceExactPrice(it.service.name, b.name);
                      return sum + (exact ?? serviceMinPrice(it.service.name)) + addonsSum(it.addons);
                    }, 0);
                    const allExact = cart.every((it) => serviceExactPrice(it.service.name, b.name) !== null);
                    return (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => {
                          setSingleBarber(b.name);
                          window.setTimeout(() => goStep(2), 150);
                        }}
                        aria-pressed={on}
                        className={
                          "flex flex-col items-center gap-2 rounded-md border p-4 text-center transition-colors " +
                          (on ? "border-accent-soft bg-accent-soft/10" : "border-line hover:border-line-2")
                        }
                      >
                        {b.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.photo} alt="" className="h-16 w-16 rounded-full object-cover ring-1 ring-line" />
                        ) : (
                          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 font-display text-2xl font-bold text-fg">
                            {(b.display ?? b.name).charAt(0)}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-fg">{b.display ?? b.name}</span>
                        <span className="text-[11px] text-muted">{tt(b.title)}</span>
                        <PriceTag value={total} from={!allExact} fromLabel={t("common.from")} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((it, idx) => (
                    <div key={it.id} className="border border-line bg-surface p-3">
                      <p className="font-semibold break-words text-fg">{tc(it.service.name)}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <select
                          value={it.barberName ?? ""}
                          onChange={(e) => patchLine(it.id, { barberName: e.target.value || null })}
                          className="border border-line-2 bg-canvas px-2 py-2 text-sm text-fg outline-none focus:border-accent-soft"
                        >
                          <option value="">{t("wiz.chooseBarber")}</option>
                          {barbersFor(it.service.name).map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.display ?? b.name} · {tt(b.title)}
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
                    </div>
                  ))}
                  {groupNeedsBarbers && <p className="text-xs text-danger">{t("wiz.needBarbers")}</p>}
                  <button
                    type="button"
                    onClick={() => canGoTid && goStep(2)}
                    disabled={!canGoTid}
                    className="w-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {t("wiz.chooseTime")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= STEG 2: TID ============================== */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              {backLink(1, t("wiz.changeBarber"))}
            </div>
            {/* Kort oppsummering så kunden alltid ser hva og hva det koster */}
            <div className="flex items-center justify-between gap-3 border border-line-2 bg-canvas px-4 py-3 text-sm">
              <span className="min-w-0 text-fg">
                <span className="font-semibold">{cart.map((it) => tc(it.service.name)).join(" + ")}</span>
                <span className="text-muted">
                  {" · "}
                  {selectedBarberObj ? (selectedBarberObj.display ?? selectedBarberObj.name) : t("wiz.anyBarberHint")}
                </span>
              </span>
              <PriceTag value={cartTotal} from={anyEstimate} size="sm" fromLabel={t("common.from")} />
            </div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t("wiz.chooseDayTime")}</p>

            {openDays.length > 0 && !slotsError && (
              <div>
                <button
                  type="button"
                  onClick={findNext}
                  disabled={loadingSlots || findingNext}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-accent-soft bg-accent-soft/10 px-4 py-3 text-sm font-semibold text-fg transition-colors hover:bg-accent-soft/20 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent-soft" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  {findingNext ? t("wiz.findingNext") : t("wiz.findNext")}
                </button>
                {nextMsg && <p className="mt-2 text-center text-sm text-muted">{nextMsg}</p>}
              </div>
            )}

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
                {t("wiz.noSlotsPeriod")} {t("wiz.tryFindNext")}
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
                          id={`wiz-day-${d.iso}`}
                          type="button"
                          onClick={() => !empty && setViewDay(d.iso)}
                          disabled={empty}
                          aria-pressed={isView}
                          aria-label={`${d.weekday} ${d.dayNum}. ${d.month} – ${
                            empty ? t("wiz.noSlotsShort") : `${count} ${t("wiz.slotsOn")}`
                          }`}
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
                            type="button"
                            onClick={() => {
                              setDate(viewDay);
                              setTime(t);
                              // Ett trykk på et klokkeslett = valgt → rett til siste steg.
                              window.setTimeout(() => goStep(3), 150);
                            }}
                            aria-pressed={active}
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

              </>
            )}
          </div>
        )}

        {/* ======================= STEG 3: INFO + FULLFØR ==================== */}
        {step === 3 && (
          <form onSubmit={submit} noValidate className="relative space-y-4">
            <div className="flex items-center justify-between gap-3">
              {backLink(2, t("wiz.changeTime"))}
            </div>

            {/* Oppsummering: hva, når, hvem og hva det koster – før man bekrefter. */}
            <div className="border border-line-2 bg-canvas p-4 text-sm">
              <p className="font-semibold text-fg">{fmtWhen(date, time)}</p>
              <ul className="mt-3 space-y-2 border-t border-line pt-3">
                {cart.map((it) => {
                  const b = lineBarber(it);
                  const lp = linePrice(it);
                  return (
                    <li key={it.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-fg">
                          {tc(it.service.name)}
                          {mode === "group" && it.person ? (
                            <span className="text-muted"> · {it.person}</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted">
                          {t("wiz.summary.barber")}: {b ? (barbers.find((x) => x.name === b)?.display ?? b) : t("wiz.anyBarber")}
                          {it.addons.length > 0 && (
                            <>
                              {" · "}
                              {t("wiz.summary.addons")}: {it.addons.map(tc).join(", ")}
                            </>
                          )}
                        </p>
                      </div>
                      <PriceTag value={lp.value} from={!lp.exact} size="sm" fromLabel={t("common.from")} />
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {t("wiz.total")}
                </span>
                <PriceTag value={cartTotal} from={anyEstimate} size="lg" fromLabel={t("common.from")} />
              </div>
              {anyEstimate && (
                <p className="mt-1 text-[11px] text-muted">{t("wiz.estimateNote")}</p>
              )}
            </div>

            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t("wiz.yourDetails")}</p>
            {remembered && (
              <p className="-mt-2 text-xs text-muted">
                {t("wiz.remembered")}{" "}
                <button type="button" onClick={forgetMe} className="font-semibold text-accent-soft hover:underline">
                  {t("wiz.notYou")}
                </button>
              </p>
            )}
            <div>
              <label htmlFor="bk-name" className={FIELD_LABEL}>
                {t("wiz.fullName")}
              </label>
              <input
                id="bk-name"
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="bk-email" className={FIELD_LABEL}>
                {t("wiz.email")}
              </label>
              <input
                id="bk-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(email && !emailOk)}
                className={FIELD}
              />
              {email && !emailOk && <p className="mt-1 text-xs text-danger">{t("wiz.invalidEmail")}</p>}
            </div>
            <div>
              <label htmlFor="bk-phone" className={FIELD_LABEL}>
                {t("wiz.phone")}
              </label>
              <div className="flex gap-2">
                <select
                  aria-label={t("wiz.countryCode")}
                  autoComplete="tel-country-code"
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
                  id="bk-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={Boolean(phone && !phoneOk)}
                  className={FIELD}
                />
              </div>
              {phone && !phoneOk && <p className="mt-1 text-xs text-danger">{t("wiz.invalidPhone")}</p>}
            </div>

            <div>
              <label htmlFor="bk-source" className={FIELD_LABEL}>
                {t("wiz.source")}
              </label>
              <select
                id="bk-source"
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={FIELD}
              >
                <option value="">{t("wiz.source.placeholder")}</option>
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.key)}
                  </option>
                ))}
              </select>
            </div>

            {showNote ? (
              <div>
                <label htmlFor="bk-note" className={FIELD_LABEL}>
                  {t("wiz.note.label")}
                </label>
                <textarea
                  id="bk-note"
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  rows={3}
                  maxLength={500}
                  autoFocus
                  placeholder={t("wiz.note.placeholder")}
                  className={FIELD + " resize-y"}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNote(true)}
                className="text-xs font-semibold text-accent-soft hover:underline"
              >
                + {t("wiz.addNote")}
              </button>
            )}

            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                name="marketingConsent"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t("wiz.marketingConsent")}</span>
            </label>

            <p className="text-[11px] leading-relaxed text-muted">
              {t("wiz.privacyNote.pre")}
              <a href="/personvern" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">
                {t("wiz.privacyNote.link")}
              </a>
              {t("wiz.privacyNote.post")}
            </p>

            {/* Honeypot: usynlig for mennesker, roboter fyller det ut. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
              <label>
                Nettside
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? t("wiz.booking") : `${t("wiz.confirm")} · ${anyEstimate ? t("common.from") : ""}${nok(cartTotal)}`}
            </button>
            {!canSubmit && !pending && (
              <p className="text-center text-xs text-muted">{t("wiz.fillToConfirm")}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
