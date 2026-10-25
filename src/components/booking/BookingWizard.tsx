"use client";

import { ScrollRow } from "@/components/booking/ScrollRow";
import { CrisisRequest } from "@/components/booking/CrisisRequest";
import type { MemberProfile } from "@/lib/member";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { trackBookingComplete, trackBookingStart } from "@/lib/track";
import { getCartSlots, createBookingGroup, findNextCartSlot } from "@/app/booking/cart-actions";
import { isValidEmail, isValidNorwegianPhone } from "@/lib/validate";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { CountryCodePicker } from "@/components/booking/CountryCodePicker";

/* =====================================================================
 * BOOKING – tre steg: Tjeneste → Tid → Bekreft.
 *   • Tjeneste: trykk for å velge (tillegg vises rett på kortet). Fast
 *     bunnlinje med totalpris og «Velg tid».
 *   • Tid: barber velges øverst («Hvem som helst» er standard), så dag og
 *     klokkeslett. Trykk på en tid → rett videre til Bekreft.
 *   • Bekreft: oppsummering + kontaktinfo. Feil vises først når kunden er
 *     ferdig med et felt (eller trykker Fullfør).
 *   Valgene huskes i økta (sessionStorage), og nettleserens tilbake-knapp
 *   går ett steg tilbake. Er tiden tatt i mellomtiden, sendes kunden
 *   tilbake til Tid med oppdaterte tider.
 * ===================================================================== */

export type WizService = {
  name: string;
  price: string;
  duration: string;
  category: string;
  description?: string;
};
export type WizBarber = { name: string; display?: string; title: string; photo?: string | null };
export type WizAddon = { name: string; price: number; durationMin: number };

const ANY = "__any__";
const STORE_KEY = "dtb-booking-v2";
const CUSTOMER_KEY = "dtb-kunde";
const STEP_LABELS = ["step.services", "step.time", "step.confirm"];

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
  "w-full rounded-xl border border-line-2 bg-surface px-4 py-3 text-base text-fg transition-colors placeholder:text-muted/70 focus:border-fg focus:outline-none aria-[invalid=true]:border-danger";
const FIELD_LABEL = "mb-1.5 block text-sm font-medium text-fg";

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const durMin = (s: string) => parseInt(s, 10) || 30;
const NF = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const nok = (n: number) => `${NF.format(Math.round(n))} kr`;

function store(kind: "session" | "local") {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}
function readJson<T>(kind: "session" | "local", key: string): T | null {
  try {
    const raw = store(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(kind: "session" | "local", key: string, value: unknown) {
  try {
    if (value == null) store(kind)?.removeItem(key);
    else store(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    /* lagring er bare en bekvemmelighet */
  }
}

type CartItem = {
  id: number;
  service: WizService;
  barberName: string | null; // gruppe-modus: barber per person
  person: string;
  addons: string[]; // add-on navn
};

type Saved = {
  cart: { s: string; a: string[]; b: string | null; p: string }[];
  mode: "single" | "group";
  barber: string;
  step: number;
  date: string;
  time: string;
};

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}
function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

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
  address = "",
  phoneNumber = "",
  member = null,
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
  address?: string;
  phoneNumber?: string;
  /** Innlogget kunde (kundekonto): ferdig utfylt + kundeklubb-pris + krisetime. */
  member?: MemberProfile | null;
}) {
  const { lang, t, tc: tcx } = useLanguage();
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  // Oversett DB-innhold; usynlig brytepunkt etter «/» («Maskinklipp/Lineup»).
  const tc = (s: string) => tcx("services", s).replace(/\//g, "/​");
  const tt = (s: string) => tcx("titles", s);
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

  const cats = useMemo(() => Array.from(new Set(services.map((s) => s.category))), [services]);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState(0);
  const [cart, setCart] = useState<CartItem[]>(() => {
    const pre = initialServiceName ? services.find((s) => s.name === initialServiceName) : null;
    return pre ? [{ id: 1, service: pre, barberName: null, person: "", addons: [] }] : [];
  });
  const nextId = useRef(100);
  const [mode, setMode] = useState<"single" | "group">("single");
  const [singleBarber, setSingleBarber] = useState<string>(() =>
    initialBarberName && barbers.some((b) => b.name === initialBarberName) ? initialBarberName : ANY,
  );

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [viewDay, setViewDay] = useState("");
  const [takenMsg, setTakenMsg] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+47");
  const [source, setSource] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean; phone?: boolean }>({});
  const [submitted, setSubmitted] = useState(false);
  // Honeypot-felt (skal alltid være tomt for ekte kunder).
  const [website, setWebsite] = useState("");

  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ portalUrl?: string; cancelUrl?: string; barber?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slotsByDate, setSlotsByDate] = useState<Record<string, string[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(false);
  const [horizon, setHorizon] = useState(28);
  const [jumpTo, setJumpTo] = useState<{ date: string; time: string } | null>(null);
  const [findingNext, setFindingNext] = useState(false);
  const [nextMsg, setNextMsg] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const addonByName = useMemo(() => {
    const m = new Map<string, WizAddon>();
    addons.forEach((a) => m.set(a.name, a));
    return m;
  }, [addons]);

  // ---- Gjenoppretting (økt + kjent kunde) ---------------------------------
  useEffect(() => {
    // Kom kunden via en «Book»-lenke med tjeneste/barber? Da starter vi friskt.
    const fresh = !!initialServiceName || !!initialBarberName;
    const saved = fresh ? null : readJson<Saved>("session", STORE_KEY);
    let startStep = 0;
    if (saved && saved.cart?.length) {
      const items: CartItem[] = [];
      for (const c of saved.cart) {
        const svc = services.find((s) => s.name === c.s);
        if (svc) {
          items.push({
            id: nextId.current++,
            service: svc,
            barberName: c.b,
            person: c.p ?? "",
            addons: (c.a ?? []).filter((a) => addonByName.has(a)),
          });
        }
      }
      if (items.length) {
        setCart(items);
        setMode(saved.mode === "group" ? "group" : "single");
        if (saved.barber === ANY || barbers.some((b) => b.name === saved.barber)) setSingleBarber(saved.barber);
        if (saved.date && saved.time) {
          setDate(saved.date);
          setTime(saved.time);
          setViewDay(saved.date);
        }
        startStep = Math.min(saved.step ?? 0, saved.date && saved.time ? 2 : 1);
      }
    }
    setStep(startStep);
    try {
      window.history.replaceState({ ...(window.history.state ?? {}), dtbStep: startStep }, "");
    } catch {
      /* noop */
    }

    const who = readJson<{ name?: string; email?: string; phone?: string; cc?: string }>("local", CUSTOMER_KEY);
    if (who?.name || who?.email || who?.phone) {
      setName(who.name ?? "");
      setEmail(who.email ?? "");
      setPhone(who.phone ?? "");
      if (who.cc) setCountryCode(who.cc);
      setRemembered(true);
    }
    // Innlogget kunde: kontaktinfo fra kundekontoen går foran det som er
    // husket på enheten.
    if (member) {
      if (member.name) setName(member.name);
      if (member.email) setEmail(member.email);
      const ph = (member.phone ?? "").replace(/\s/g, "");
      const no = ph.replace(/^(\+47|0047)/, "");
      if (/^\d{8}$/.test(no)) {
        setPhone(no);
        setCountryCode("+47");
      }
      setRemembered(false);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lagre valgene i økta, så en oppdatering ikke tømmer alt.
  useEffect(() => {
    if (!restored || done) return;
    const saved: Saved = {
      cart: cart.map((c) => ({ s: c.service.name, a: c.addons, b: c.barberName, p: c.person })),
      mode,
      barber: singleBarber,
      step,
      date,
      time,
    };
    writeJson("session", STORE_KEY, cart.length ? saved : null);
  }, [cart, mode, singleBarber, step, date, time, restored, done]);

  // Nettleserens tilbake/fram-knapp flytter mellom stegene. `depth` = hvor
  // mange steg-oppføringer vi har lagt på historikken (så «Tilbake» i
  // veiviseren og nettleserens tilbake-knapp gjør det samme).
  const depth = useRef(0);
  const stepRef = useRef(0);
  stepRef.current = step;
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { dtbStep?: number } | null)?.dtbStep;
      if (typeof s !== "number") return;
      const next = Math.max(0, Math.min(2, s));
      depth.current = Math.max(0, depth.current + (next < stepRef.current ? -1 : 1));
      setStep(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const startTracked = useRef(false);
  function goStep(n: number) {
    const back = step - n;
    if (back > 0 && depth.current >= back) {
      // Gå tilbake i historikken (popstate setter steget).
      depth.current -= back - 1;
      window.history.go(-back);
      return;
    }
    if (n === 1 && step === 0 && !startTracked.current) {
      startTracked.current = true;
      trackBookingStart();
    }
    setStep(n);
    try {
      if (back > 0) {
        window.history.replaceState({ dtbStep: n }, "");
      } else {
        window.history.pushState({ dtbStep: n }, "");
        depth.current += 1;
      }
    } catch {
      /* noop */
    }
  }

  // Ved stegbytte: rull til toppen av veiviseren og flytt fokus til overskriften.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = rootRef.current;
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  // Åpne dager fremover (hopp over stengte ukedager).
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
  const serviceMinPrice = (n: string) => {
    const lv = levelPrices[n];
    const vals = lv ? Object.values(lv) : [];
    if (vals.length) return Math.min(...vals);
    return parseInt(services.find((s) => s.name === n)?.price ?? "", 10) || 0;
  };
  const serviceVaries = (n: string) => {
    const vals = levelPrices[n] ? Object.values(levelPrices[n]) : [];
    return vals.length > 1 && Math.min(...vals) !== Math.max(...vals);
  };
  const serviceExactPrice = (n: string, barber: string | null) => {
    if (!barber || barber === ANY) return null;
    const slug = barberLevels[barber];
    const p = slug ? levelPrices[n]?.[slug] : undefined;
    return typeof p === "number" ? p : null;
  };
  const addonsSum = (names: string[]) => names.reduce((s, n) => s + (addonByName.get(n)?.price ?? 0), 0);
  const addonsMinutes = (names: string[]) =>
    names.reduce((s, n) => s + (addonByName.get(n)?.durationMin ?? 0), 0);

  const lineBarber = (it: CartItem) =>
    mode === "single" ? (singleBarber === ANY ? null : singleBarber) : it.barberName;
  const linePrice = (it: CartItem) => {
    const exact = serviceExactPrice(it.service.name, lineBarber(it));
    const svc = exact ?? serviceMinPrice(it.service.name);
    return {
      value: svc + addonsSum(it.addons),
      estimate: exact == null && serviceVaries(it.service.name),
    };
  };
  const cartTotal = cart.reduce((s, it) => s + linePrice(it).value, 0);
  // Kundeklubb-rabatt på tjenester (bare innloggede; kassa trekker den automatisk).
  const memberPct = member && member.servicePct > 0 ? member.servicePct : 0;
  // «Bare ledige tider»: rabatten gjelder man–fre med start før kl. 15.
  const offpeakOk = (iso: string, hhmm: string) => {
    if (!iso || !hhmm) return false;
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay(); // 0 = søndag
    return dow >= 1 && dow <= 5 && hhmm < "15:00";
  };
  const memberApplies = memberPct > 0 && (!member?.serviceOffpeak || offpeakOk(date, time));
  const memberDisc = memberApplies ? Math.round((cartTotal * memberPct) / 100) : 0;
  const payTotal = cartTotal - memberDisc;
  const anyEstimate = cart.some((it) => linePrice(it).estimate);
  const lineMin = (it: CartItem) => durMin(it.service.duration) + addonsMinutes(it.addons);
  const cartMinutes =
    mode === "single"
      ? cart.reduce((s, it) => s + lineMin(it), 0)
      : Math.max(0, ...cart.map(lineMin));

  const barbersFor = (serviceName: string) => {
    const ex = new Set(exclusions[serviceName] ?? []);
    return barbers.filter((b) => !ex.has(b.name));
  };
  const barbersForAll = useMemo(
    () => barbers.filter((b) => cart.every((it) => !(exclusions[it.service.name] ?? []).includes(b.name))),
    [barbers, cart, exclusions],
  );
  // Valgt barber kan ikke ta alt i kurven lenger → tilbake til «hvem som helst».
  useEffect(() => {
    if (singleBarber !== ANY && cart.length && !barbersForAll.some((b) => b.name === singleBarber)) {
      setSingleBarber(ANY);
    }
  }, [barbersForAll, singleBarber, cart.length]);

  // ---- Kurv-operasjoner ----------------------------------------------------
  const newLine = (service: WizService): CartItem => ({
    id: nextId.current++,
    service,
    barberName: null,
    person: "",
    addons: [],
  });
  const toggleService = (service: WizService) =>
    setCart((c) =>
      c.some((l) => l.service.name === service.name)
        ? c.filter((l) => l.service.name !== service.name)
        : [...c, newLine(service)],
    );
  const addLine = (service: WizService) => setCart((c) => [...c, newLine(service)]);
  const removeOneOf = (serviceName: string) =>
    setCart((c) => {
      const idx = c.map((l) => l.service.name).lastIndexOf(serviceName);
      return idx < 0 ? c : c.filter((_, i) => i !== idx);
    });
  const patchLine = (id: number, patch: Partial<CartItem>) =>
    setCart((c) => c.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const toggleAddon = (id: number, n: string) =>
    setCart((c) =>
      c.map((l) =>
        l.id === id ? { ...l, addons: l.addons.includes(n) ? l.addons.filter((a) => a !== n) : [...l.addons, n] } : l,
      ),
    );
  const setGroupMode = (on: boolean) => {
    setMode(on ? "group" : "single");
    if (!on) {
      // Tilbake til «bare meg»: én av hver tjeneste.
      setCart((c) => c.filter((l, i) => c.findIndex((x) => x.service.name === l.service.name) === i));
    }
  };

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
  const slotsKey = JSON.stringify(cartLines.map((l) => [l.serviceName, l.addonMinutes, l.barberName])) + mode;
  const groupNeedsBarbers = mode === "group" && cart.some((it) => !it.barberName);

  // ---- Ledige tider (hentes på Tid-steget og når barber/kurv endres) ------
  const halfHourSlots = (iso: string) =>
    (slotsByDate[iso] ?? []).filter((x) => x.endsWith(":00") || x.endsWith(":30"));

  useEffect(() => {
    if (step !== 1 || cart.length === 0 || openDays.length === 0 || groupNeedsBarbers) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(false);
    getCartSlots(cartLines, mode, openDays[0].iso, openDays[openDays.length - 1].iso)
      .then((res) => {
        if (cancelled) return;
        if (res.error) setSlotsError(true);
        const by = res.byDate ?? {};
        setSlotsByDate(by);
        const half = (iso: string) => (by[iso] ?? []).filter((x) => x.endsWith(":00") || x.endsWith(":30"));
        if (jumpTo && half(jumpTo.date).includes(jumpTo.time)) {
          setViewDay(jumpTo.date);
          setJumpTo(null);
          requestAnimationFrame(() =>
            document.getElementById(`wiz-day-${jumpTo.date}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }),
          );
          return;
        }
        setViewDay((cur) => {
          if (cur && half(cur).length) return cur;
          return openDays.find((d) => half(d.iso).length > 0)?.iso ?? openDays[0]?.iso ?? "";
        });
      })
      .catch(() => !cancelled && setSlotsError(true))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, horizon, slotsKey, refreshTick, groupNeedsBarbers]);

  function chooseSlot(d: string, tm: string) {
    setDate(d);
    setTime(tm);
    setTakenMsg(false);
    setError(null);
    goStep(2);
  }

  /** «Finn neste ledige tid»: først i det som er hentet, ellers lenger frem. */
  async function findNext() {
    setNextMsg(null);
    for (const d of openDays) {
      if (halfHourSlots(d.iso).length) {
        setViewDay(d.iso);
        document.getElementById(`wiz-day-${d.iso}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        return;
      }
    }
    if (openDays.length === 0) return;
    setFindingNext(true);
    try {
      const next = new Date(openDays[openDays.length - 1].iso + "T12:00:00");
      next.setDate(next.getDate() + 1);
      const found = await findNextCartSlot(cartLines, mode, isoDate(next));
      if (!found) {
        setNextMsg(t("wiz.noNextSlot"));
        return;
      }
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

  // ---- Kontaktinfo + validering --------------------------------------------
  const nameOk = name.trim().length >= 2;
  const emailOk = isValidEmail(email);
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneOk =
    countryCode === "+47" ? isValidNorwegianPhone(phone) : phoneDigits.length >= 5 && phoneDigits.length <= 14;
  const showErr = (f: "name" | "email" | "phone", ok: boolean) => !ok && (submitted || !!touched[f]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (pending) return;
    setSubmitted(true);
    const firstBad = !nameOk ? "bk-name" : !emailOk ? "bk-email" : !phoneOk ? "bk-phone" : null;
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
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
        lang,
      });
      if (res?.code === "taken") {
        setTime("");
        setTakenMsg(true);
        setRefreshTick((x) => x + 1);
        goStep(1);
        return;
      }
      if (res?.error) {
        setError(res.error);
        return;
      }
      writeJson("local", CUSTOMER_KEY, { name: name.trim(), email: email.trim(), phone: phone.trim(), cc: countryCode });
      writeJson("session", STORE_KEY, null);
      setResult({ portalUrl: res?.portalUrl, cancelUrl: res?.cancelUrl, barber: res?.barber });
      setDone(true);
      trackBookingComplete({ value: cartTotal, services: cart.map((it) => it.service.name) });
      try {
        window.history.replaceState(null, "", "/booking?bekreftet=1");
      } catch {
        /* noop */
      }
    } catch {
      setError(t("wiz.err.network") + (phoneNumber ? ` ${phoneNumber}.` : ""));
    } finally {
      setPending(false);
    }
  }

  function forgetMe() {
    writeJson("local", CUSTOMER_KEY, null);
    setName("");
    setEmail("");
    setPhone("");
    setCountryCode("+47");
    setRemembered(false);
    setTouched({});
    setSubmitted(false);
    requestAnimationFrame(() => document.getElementById("bk-name")?.focus());
  }

  // Kalenderfil (.ics) for «Legg i kalender».
  function downloadIcs() {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    if (!y || !m || !d) return;
    const start = new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0));
    const end = new Date(start.getTime() + Math.max(15, cartMinutes) * 60000);
    const local = (x: Date) =>
      `${x.getUTCFullYear()}${String(x.getUTCMonth() + 1).padStart(2, "0")}${String(x.getUTCDate()).padStart(2, "0")}T${String(
        x.getUTCHours(),
      ).padStart(2, "0")}${String(x.getUTCMinutes()).padStart(2, "0")}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const what = cart.map((it) => tc(it.service.name).replace(/​/g, "")).join(", ");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Downtown Barbers//Booking//NO",
      "BEGIN:VEVENT",
      `UID:${stamp}-${Math.random().toString(36).slice(2)}@downtownbarbers.no`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Oslo:${local(start)}`,
      `DTEND;TZID=Europe/Oslo:${local(end)}`,
      `SUMMARY:${esc(`Downtown Barbers – ${what}`)}`,
      address ? `LOCATION:${esc(address)}` : "",
      `DESCRIPTION:${esc(result.barber ? `${t("wiz.summary.barber")}: ${result.barber}` : what)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "downtown-barbers.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const barberLabel = (n: string | null) =>
    n ? (barbers.find((x) => x.name === n)?.display ?? n) : t("wiz.anyBarber");
  const mapHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  // ======================= BEKREFTET =========================================
  if (done) {
    const first = name.trim().split(/\s+/)[0] ?? "";
    return (
      <div ref={rootRef} className="rounded-[28px] bg-surface p-7 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_60px_-30px_rgba(0,0,0,0.25)] sm:p-12">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft/15 text-accent-ink">
          <CheckIcon className="h-8 w-8" />
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="m-title mt-6 text-3xl outline-none sm:text-4xl">
          {t("wiz.done.title").replace("{name}", first)}
        </h2>
        <p className="mt-3 text-muted">{t("wiz.done.sent")}</p>

        <dl className="mx-auto mt-8 max-w-md divide-y divide-line rounded-2xl bg-canvas px-5 text-left text-[15px]">
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-muted">{t("wiz.summary.when")}</dt>
            <dd className="text-right font-medium text-fg">{fmtWhen(date, time)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3.5">
            <dt className="text-muted">{t("step.services")}</dt>
            <dd className="text-right font-medium text-fg">{cart.map((it) => tc(it.service.name)).join(", ")}</dd>
          </div>
          {mode === "single" && (
            <div className="flex justify-between gap-4 py-3.5">
              <dt className="text-muted">{t("wiz.summary.barber")}</dt>
              <dd className="text-right font-medium text-fg">{result.barber ?? barberLabel(lineBarber(cart[0]))}</dd>
            </div>
          )}
          {address && (
            <div className="flex justify-between gap-4 py-3.5">
              <dt className="text-muted">{t("wiz.where")}</dt>
              <dd className="text-right font-medium text-fg">{address}</dd>
            </div>
          )}
        </dl>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={downloadIcs} className="pill pill-dark">
            {t("wiz.addToCal")}
          </button>
          {mapHref && (
            <a href={mapHref} target="_blank" rel="noopener noreferrer" className="pill pill-soft">
              {t("home.contact.directions")} <span aria-hidden>↗</span>
            </a>
          )}
          {result.portalUrl && (
            <a href={result.portalUrl} className="pill pill-soft">
              {t("wiz.manage")}
            </a>
          )}
        </div>
        {result.cancelUrl && (
          <p className="mt-6 text-sm text-muted">
            {t("wiz.needCancel")}{" "}
            <a href={result.cancelUrl} className="underline underline-offset-2 hover:text-fg">
              {t("wiz.cancel")}
            </a>
          </p>
        )}
      </div>
    );
  }

  // ======================= VEIVISER ==========================================
  const stepTitle = [t("wiz.h.service"), t("wiz.h.time"), t("wiz.h.confirm")][step];

  return (
    <div ref={rootRef}>
      {/* Fremdrift */}
      <div className="mb-7">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted" aria-live="polite">
            {t("wiz.stepWord")} {step + 1} {t("wiz.of")} 3 · {t(STEP_LABELS[step])}
          </p>
          {step > 0 && (
            <button type="button" onClick={() => goStep(step - 1)} className="m-link min-h-11 text-[15px]">
              <span aria-hidden>‹</span> {t("wiz.back")}
            </button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={"h-1 rounded-full transition-colors duration-500 " + (i <= step ? "bg-fg" : "bg-line")}
            />
          ))}
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="m-title mt-6 text-3xl outline-none sm:text-4xl">
          {stepTitle}
        </h2>
      </div>

      {/* ======================= STEG 1: TJENESTE ========================= */}
      {step === 0 && (
        <div className={cart.length ? "pb-28" : ""}>

          <div className="space-y-9">
            {cats.map((cat) => (
              <section key={cat} aria-labelledby={`cat-${cat}`}>
                <h3 id={`cat-${cat}`} className="mb-3 text-[13px] font-semibold tracking-[-0.005em] text-muted">
                  {tc(cat)}
                </h3>
                <ul className="space-y-2.5">
                  {services
                    .filter((s) => s.category === cat)
                    .map((s) => {
                      const lines = cart.filter((l) => l.service.name === s.name);
                      const sel = lines.length > 0;
                      const exact = serviceExactPrice(s.name, singleBarber);
                      const priceTxt =
                        exact != null
                          ? nok(exact)
                          : `${serviceVaries(s.name) ? t("common.from") : ""}${nok(serviceMinPrice(s.name))}`;
                      return (
                        <li
                          key={s.name}
                          className={
                            "overflow-hidden rounded-2xl bg-surface transition-shadow duration-300 " +
                            (sel
                              ? "shadow-[0_0_0_2px_oklch(var(--fg))]"
                              : "shadow-[0_0_0_1px_oklch(var(--line))] hover:shadow-[0_0_0_1px_oklch(var(--line-2))]")
                          }
                        >
                          {mode === "single" ? (
                            <button
                              type="button"
                              onClick={() => toggleService(s)}
                              aria-pressed={sel}
                              className="flex w-full items-start gap-4 p-4 text-left sm:p-5"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold break-words text-fg">{tc(s.name)}</span>
                                {s.description && (
                                  <span className="mt-1 block text-sm leading-relaxed text-muted">{tc(s.description)}</span>
                                )}
                                <span className="mt-2 block text-[13px] text-muted tabular-nums">
                                  {s.duration} · <span className="font-semibold text-fg">{priceTxt}</span>
                                </span>
                              </span>
                              <span
                                aria-hidden
                                className={
                                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors " +
                                  (sel ? "bg-fg text-canvas" : "text-muted shadow-[inset_0_0_0_1.5px_oklch(var(--line-2))]")
                                }
                              >
                                {sel ? <CheckIcon /> : <PlusIcon />}
                              </span>
                            </button>
                          ) : (
                            <div className="flex items-start gap-4 p-4 sm:p-5">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold break-words text-fg">{tc(s.name)}</p>
                                <p className="mt-2 text-[13px] text-muted tabular-nums">
                                  {s.duration} · <span className="font-semibold text-fg">{priceTxt}</span>
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1" role="group" aria-label={tc(s.name)}>
                                <button
                                  type="button"
                                  onClick={() => removeOneOf(s.name)}
                                  disabled={!sel}
                                  aria-label={`${t("wiz.remove")} ${tc(s.name)}`}
                                  className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-fg transition-colors hover:bg-surface-2 disabled:opacity-30"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                                  {lines.length}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => addLine(s)}
                                  aria-label={`${t("wiz.addService")} ${tc(s.name)}`}
                                  className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-fg transition-colors hover:bg-surface-2"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Tillegg rett på kortet */}
                          {sel && addons.length > 0 && (
                            <div className="space-y-3 border-t border-line px-4 pt-3 pb-4 sm:px-5">
                              {lines.map((line, li) => (
                                <div key={line.id}>
                                  <p className="mb-2 text-[13px] text-muted">
                                    {mode === "group" && lines.length > 1
                                      ? `${t("wiz.person")} ${li + 1} – ${t("wiz.addonsOptional").toLowerCase()}`
                                      : t("wiz.addonsOptional")}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {addons.map((a) => {
                                      const on = line.addons.includes(a.name);
                                      return (
                                        <button
                                          key={a.name}
                                          type="button"
                                          onClick={() => toggleAddon(line.id, a.name)}
                                          aria-pressed={on}
                                          className={
                                            "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm transition-colors " +
                                            (on
                                              ? "bg-fg text-canvas"
                                              : "bg-surface-2 text-fg hover:bg-line")
                                          }
                                        >
                                          {on ? <CheckIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
                                          {tc(a.name)}
                                          <span className={"tabular-nums " + (on ? "text-canvas/70" : "text-muted")}>
                                            +{nok(a.price)}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setGroupMode(mode !== "group")}
              aria-pressed={mode === "group"}
              className="pill pill-soft"
            >
              {mode === "group" ? t("wiz.groupOff") : t("wiz.groupOn")}
            </button>
          </div>

          {/* Fast bunnlinje med totalpris */}
          {cart.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-30 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-[22px] bg-fg/95 py-2.5 pr-2.5 pl-5 text-canvas shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] backdrop-blur-md">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-canvas/70 tabular-nums">
                    {cart.length} {t("wiz.selectedCount")} · ~{cartMinutes} min
                  </p>
                  <p className="text-lg font-semibold tracking-tight tabular-nums">
                    {anyEstimate ? t("common.from") : ""}
                    {nok(payTotal)}
                    {memberPct > 0 && (
                      <span className="ml-2 text-[13px] font-medium text-canvas/70">
                        {member?.tierName} −{memberPct} %{member?.serviceOffpeak ? ` ${t("wiz.offpeakShort")}` : ""}
                      </span>
                    )}
                  </p>
                </div>
                <button type="button" onClick={() => goStep(1)} className="pill pill-primary">
                  {t("wiz.chooseTimeBtn")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= STEG 2: TID ============================== */}
      {step === 1 && (
        <div className="space-y-8">
          <div className="-mt-3 flex flex-wrap items-baseline gap-x-2 text-muted">
            <span>
              {cart.map((it) => tc(it.service.name)).join(" + ")} · ~{cartMinutes} min
            </span>
            <button type="button" onClick={() => goStep(0)} className="m-link min-h-11">
              {t("wiz.change")}
            </button>
          </div>

          {takenMsg && (
            <p role="alert" className="rounded-2xl bg-accent-soft/12 px-5 py-4 text-[15px] text-fg">
              {t("wiz.taken")}
            </p>
          )}

          {/* Barber */}
          {mode === "single" ? (
            <section aria-labelledby="wiz-barber">
              <h3 id="wiz-barber" className="mb-3 text-[13px] font-semibold text-muted">
                {t("wiz.barberLabel")}
              </h3>
              <ScrollRow
                className="-mx-5 px-5 py-1 sm:mx-0 sm:px-1"
                prevLabel={t("wiz.scrollPrev")}
                nextLabel={t("wiz.scrollNext")}
              >
                {[{ name: ANY, title: "" } as WizBarber, ...barbersForAll].map((b) => {
                  const any = b.name === ANY;
                  const on = singleBarber === b.name;
                  const label = any ? t("wiz.anyBarber") : (b.display ?? b.name);
                  const total = any
                    ? null
                    : cart.reduce(
                        (sum, it) =>
                          sum + (serviceExactPrice(it.service.name, b.name) ?? serviceMinPrice(it.service.name)) + addonsSum(it.addons),
                        0,
                      );
                  return (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => setSingleBarber(b.name)}
                      aria-pressed={on}
                      className="flex w-[92px] flex-col items-center gap-2 rounded-2xl py-2 text-center"
                    >
                      <span
                        className={
                          "flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-surface-2 transition-shadow " +
                          (on ? "shadow-[0_0_0_2px_oklch(var(--canvas)),0_0_0_4px_oklch(var(--fg))]" : "")
                        }
                      >
                        {any ? (
                          <span className="text-xl text-fg" aria-hidden>
                            ✂
                          </span>
                        ) : b.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.photo} alt="" width={64} height={64} className="h-full w-full object-cover object-top" />
                        ) : (
                          <span className="text-xl font-semibold text-fg/60" aria-hidden>
                            {label.charAt(0)}
                          </span>
                        )}
                      </span>
                      <span className={"line-clamp-2 w-full text-[13px] leading-tight break-words " + (on ? "font-semibold text-fg" : "text-fg")}>
                        {label}
                      </span>
                      {!any && b.title && (
                        <span className="-mt-1.5 line-clamp-1 w-full text-[11px] leading-tight text-fg/70">
                          {tt(b.title)}
                        </span>
                      )}
                      <span className="-mt-1.5 text-[11px] text-muted tabular-nums">
                        {any ? t("wiz.anyBarberHint") : nok(total ?? 0)}
                      </span>
                    </button>
                  );
                })}
              </ScrollRow>
            </section>
          ) : (
            <section aria-labelledby="wiz-barber" className="space-y-3">
              <h3 id="wiz-barber" className="text-[13px] font-semibold text-muted">
                {t("wiz.barberPerPerson")}
              </h3>
              {cart.map((it, idx) => (
                <div key={it.id} className="rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_oklch(var(--line))]">
                  <p className="font-semibold break-words text-fg">
                    {t("wiz.person")} {idx + 1} · {tc(it.service.name)}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`gb-${it.id}`} className="sr-only">
                        {t("wiz.barberLabel")} – {t("wiz.person")} {idx + 1}
                      </label>
                      <select
                        id={`gb-${it.id}`}
                        value={it.barberName ?? ""}
                        onChange={(e) => patchLine(it.id, { barberName: e.target.value || null })}
                        className={FIELD}
                      >
                        <option value="">{t("wiz.chooseBarber")}</option>
                        {barbersFor(it.service.name).map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.display ?? b.name} · {tt(b.title)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`gp-${it.id}`} className="sr-only">
                        {t("wiz.personName")} – {t("wiz.person")} {idx + 1}
                      </label>
                      <input
                        id={`gp-${it.id}`}
                        value={it.person}
                        autoComplete="off"
                        onChange={(e) => patchLine(it.id, { person: e.target.value })}
                        placeholder={`${t("wiz.personName")} (${t("wiz.optional")})`}
                        className={FIELD}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {groupNeedsBarbers && <p className="text-sm text-muted">{t("wiz.needBarbers")}</p>}
            </section>
          )}

          {/* Dag + tid */}
          {!groupNeedsBarbers && (
            <section aria-labelledby="wiz-day" className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h3 id="wiz-day" className="text-[13px] font-semibold text-muted">
                  {t("wiz.chooseDayTime")}
                </h3>
                {openDays.length > 0 && !slotsError && (
                  <button
                    type="button"
                    onClick={findNext}
                    disabled={loadingSlots || findingNext}
                    className="m-link min-h-11 text-[15px] disabled:opacity-50"
                  >
                    {findingNext ? t("wiz.findingNext") : t("wiz.findNext")}
                  </button>
                )}
              </div>
              {nextMsg && <p className="text-sm text-muted">{nextMsg}</p>}

              {openDays.length === 0 ? (
                <p className="text-muted">{t("wiz.noOpenDays")}</p>
              ) : slotsError ? (
                <p role="alert" className="text-danger">
                  {t("wiz.slotsError")}
                </p>
              ) : (
                <>
                  <ScrollRow
                    className="-mx-5 gap-2 px-5 py-1 sm:mx-0 sm:px-1"
                    prevLabel={t("wiz.scrollPrev")}
                    nextLabel={t("wiz.scrollNext")}
                  >
                    {openDays.map((d) => {
                      const count = halfHourSlots(d.iso).length;
                      const isView = viewDay === d.iso;
                      const empty = !loadingSlots && count === 0;
                      return (
                        <button
                          key={d.iso}
                          id={`wiz-day-${d.iso}`}
                          type="button"
                          onClick={() => setViewDay(d.iso)}
                          disabled={empty}
                          aria-pressed={isView}
                          aria-label={`${d.weekday} ${d.dayNum}. ${d.month} – ${
                            empty ? t("wiz.noSlotsShort") : `${count} ${t("wiz.slotsOn")}`
                          }`}
                          className={
                            "flex w-16 flex-col items-center rounded-2xl py-2.5 transition-colors " +
                            (isView
                              ? "bg-fg text-canvas"
                              : empty
                                ? "bg-surface text-muted opacity-40"
                                : "bg-surface text-fg shadow-[0_0_0_1px_oklch(var(--line))] hover:shadow-[0_0_0_1px_oklch(var(--line-2))]")
                          }
                        >
                          <span className={"text-[11px] font-medium " + (isView ? "text-canvas/70" : "text-muted")}>
                            {d.weekday}
                          </span>
                          <span className="text-xl font-semibold tracking-tight tabular-nums">{d.dayNum}</span>
                          <span className={"text-[11px] " + (isView ? "text-canvas/70" : "text-muted")}>{d.month}</span>
                        </button>
                      );
                    })}
                  </ScrollRow>

                  {loadingSlots ? (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-busy="true" aria-label={t("wiz.loadingSlots")}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} className="h-11 animate-pulse rounded-full bg-surface-2" />
                      ))}
                    </div>
                  ) : openDays.every((d) => halfHourSlots(d.iso).length === 0) ? (
                    <p className="text-muted">
                      {t("wiz.noSlotsPeriod")} {t("wiz.tryFindNext")}
                    </p>
                  ) : halfHourSlots(viewDay).length === 0 ? (
                    <p className="text-muted">{t("wiz.noSlotsDay")}</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {halfHourSlots(viewDay).map((tm) => {
                        const active = date === viewDay && time === tm;
                        return (
                          <button
                            key={tm}
                            type="button"
                            onClick={() => chooseSlot(viewDay, tm)}
                            aria-pressed={active}
                            className={
                              "min-h-11 rounded-full text-[15px] font-medium tabular-nums transition-colors " +
                              (active
                                ? "bg-fg text-canvas"
                                : "bg-surface text-fg shadow-[0_0_0_1px_oklch(var(--line))] hover:bg-fg hover:text-canvas")
                            }
                          >
                            {tm}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {/* Krisetime for kundeklubb-nivåer som har det (f.eks. Platinum). */}
      {step === 1 && member?.crisis && (
        <div className="mt-10">
          <CrisisRequest
            tierName={member.tierName ?? ""}
            service={cart.map((it) => it.service.name).join(" + ")}
          />
        </div>
      )}

      {/* ======================= STEG 3: BEKREFT ========================== */}
      {step === 2 && (
        <form onSubmit={submit} noValidate className="relative space-y-6">
          {/* Oppsummering */}
          <div className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_oklch(var(--line))] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold tracking-tight text-fg">{fmtWhen(date, time)}</p>
              <button type="button" onClick={() => goStep(1)} className="m-link -mt-2.5 min-h-11 shrink-0">
                {t("wiz.change")}
              </button>
            </div>
            <ul className="mt-3 space-y-2.5 border-t border-line pt-3">
              {cart.map((it) => {
                const lp = linePrice(it);
                return (
                  <li key={it.id} className="flex items-start justify-between gap-3 text-[15px]">
                    <div className="min-w-0">
                      <p className="text-fg">
                        {tc(it.service.name)}
                        {mode === "group" && it.person ? <span className="text-muted"> · {it.person}</span> : null}
                      </p>
                      <p className="text-[13px] text-muted">
                        {barberLabel(lineBarber(it))}
                        {it.addons.length > 0 && <> · {it.addons.map(tc).join(", ")}</>}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-fg">
                      {lp.estimate ? t("common.from") : ""}
                      {nok(lp.value)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {memberDisc > 0 && (
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-[15px]">
                <span className="text-fg">
                  {member?.tierName}-{t("wiz.memberPrice")}{" "}
                  <span className="text-muted">(−{memberPct} %)</span>
                </span>
                <span className="tabular-nums text-fg">−{nok(memberDisc)}</span>
              </div>
            )}
            {memberPct > 0 && !memberApplies && (
              <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
                {member?.tierName}: {t("wiz.offpeakNote").replace("{pct}", String(memberPct))}
              </p>
            )}
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-medium text-fg">{t("wiz.total")}</span>
              <span className="text-lg font-semibold tracking-tight tabular-nums text-fg">
                {anyEstimate ? t("common.from") : ""}
                {nok(payTotal)}
              </span>
            </div>
            {anyEstimate && <p className="mt-1 text-[13px] text-muted">{t("wiz.estimateNote")}</p>}
          </div>

          {member && (
            <p className="text-[15px] text-muted">
              {t("wiz.loggedInAs")} <span className="font-medium text-fg">{member.name || member.email}</span>
              {member.tierName ? ` · ${member.tierName}` : ""}
              {memberDisc > 0 ? ` · ${t("wiz.memberApplied")}` : ""}
            </p>
          )}
          {!member && remembered && (
            <p className="text-[15px] text-muted">
              {t("wiz.remembered")}{" "}
              <button type="button" onClick={forgetMe} className="m-link">
                {t("wiz.notYou")}
              </button>
            </p>
          )}

          <div className="space-y-4">
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
                onBlur={() => setTouched((x) => ({ ...x, name: true }))}
                aria-invalid={showErr("name", nameOk)}
                aria-describedby={showErr("name", nameOk) ? "bk-name-err" : undefined}
                className={FIELD}
              />
              {showErr("name", nameOk) && (
                <p id="bk-name-err" className="mt-1.5 text-sm text-danger">
                  {t("wiz.err.name")}
                </p>
              )}
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
                spellCheck={false}
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((x) => ({ ...x, email: true }))}
                aria-invalid={showErr("email", emailOk)}
                aria-describedby={showErr("email", emailOk) ? "bk-email-err" : undefined}
                placeholder={t("wiz.emailPh")}
                className={FIELD}
              />
              {showErr("email", emailOk) && (
                <p id="bk-email-err" className="mt-1.5 text-sm text-danger">
                  {t("wiz.err.email")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="bk-phone" className={FIELD_LABEL}>
                {t("wiz.phone")}
              </label>
              <div className="flex gap-2">
                <CountryCodePicker
                  ariaLabel={t("wiz.countryCode")}
                  value={countryCode}
                  onChange={setCountryCode}
                  locale={locale}
                />
                <input
                  id="bk-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched((x) => ({ ...x, phone: true }))}
                  aria-invalid={showErr("phone", phoneOk)}
                  aria-describedby={showErr("phone", phoneOk) ? "bk-phone-err" : undefined}
                  placeholder={countryCode === "+47" ? "912 34 567" : ""}
                  className={FIELD}
                />
              </div>
              {showErr("phone", phoneOk) && (
                <p id="bk-phone-err" className="mt-1.5 text-sm text-danger">
                  {countryCode === "+47" ? t("wiz.err.phoneNo") : t("wiz.err.phone")}
                </p>
              )}
            </div>

            {noteOpen || note ? (
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
                  placeholder={t("wiz.note.placeholder")}
                  className={FIELD + " resize-y"}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNoteOpen(true);
                  requestAnimationFrame(() => document.getElementById("bk-note")?.focus());
                }}
                className="m-link min-h-11"
              >
                <PlusIcon className="h-3.5 w-3.5" /> {t("wiz.addNote")}
              </button>
            )}

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

            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-muted">
              <input
                type="checkbox"
                name="marketingConsent"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[oklch(var(--fg))]"
              />
              <span>{t("wiz.marketingConsent")}</span>
            </label>
          </div>

          {/* Honeypot: usynlig for mennesker, roboter fyller det ut. */}
          <div aria-hidden="true" className="absolute top-auto -left-[9999px] h-px w-px overflow-hidden">
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
            <p role="alert" className="rounded-2xl bg-danger/10 px-5 py-4 text-[15px] text-danger">
              {error}
            </p>
          )}

          <div className="space-y-3">
            <button type="submit" disabled={pending} aria-busy={pending} className="pill pill-primary w-full text-base disabled:opacity-70">
              {pending ? t("wiz.booking") : t("wiz.confirm")}
            </button>
            <p className="text-center text-[13px] leading-relaxed text-muted">
              {t("wiz.privacyNote.pre")}
              <a href="/personvern" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">
                {t("wiz.privacyNote.link")}
              </a>
              {t("wiz.privacyNote.post")}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
