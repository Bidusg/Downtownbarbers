"use server";

import { getCustomerToken } from "@/lib/customer-session";
import { getPromoSlug } from "@/lib/promo";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getPublicBarbers } from "@/lib/queries";
import { getPublicServiceExclusions } from "@/lib/service-catalog-queries";
import { sendBookingConfirmation, sendNewBookingAlert } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { osloToUtcISO } from "@/lib/oslo-time";
import { sendBookingConfirmationSms } from "@/lib/sms-booking";
import { isValidEmail, isValidNorwegianPhone, titleCase } from "@/lib/validate";
import { customerBookingLimited, ipRateLimited, isHoneypotTripped } from "@/lib/abuse-guard";
import { getRequestLang, normLang } from "@/lib/i18n/server-lang";

export type CartMode = "single" | "group";

export type CartLineInput = {
  serviceName: string;
  serviceMinutes: number; // tjenestens egen varighet
  addonMinutes: number; // sum ekstra tid fra tillegg
  addonNames: string[]; // navn på valgte tillegg
  barberName: string | null; // null = «hvilken som helst» (kun single-modus)
  person?: string; // valgfri etikett (gruppe-modus)
};

/** Aktive barbere som IKKE er ekskludert for tjenesten. */
async function eligibleBarbers(
  serviceName: string,
  barbers: { name: string }[],
  exclusions: Record<string, string[]>,
): Promise<string[]> {
  const ex = new Set(exclusions[serviceName] ?? []);
  return barbers.map((b) => b.name).filter((n) => !ex.has(n));
}

const lineMinutes = (l: CartLineInput) =>
  Math.max(5, (l.serviceMinutes || 30) + (l.addonMinutes || 0));

const MAX_LINES = 6;
const MAX_ADDONS_PER_LINE = 10;
const MAX_DAYS_AHEAD = 366;
/** Maks spenn per RPC-kall; available_slots_dur_range returnerer tomt over 60 dager. */
const RANGE_CHUNK_DAYS = 58;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «I dag» i Oslo som yyyy-mm-dd (Vercel kjører i UTC). */
function osloTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Bygger kurven på nytt fra det SERVEREN vet: varighet kommer fra
 * services-tabellen (tjeneste + tillegg), aldri fra klientens tall. Avviser
 * ukjente tjenester/tillegg/barbere og barber som er ekskludert for tjenesten.
 */
async function resolveLines(
  sb: Awaited<ReturnType<typeof createClient>>,
  lines: CartLineInput[],
  barbers: { name: string }[],
  exclusions: Record<string, string[]>,
): Promise<{ lines: CartLineInput[] } | { error: string }> {
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Kurven er tom." };
  if (lines.length > MAX_LINES) return { error: "For mange behandlinger i én bestilling." };

  const names = new Set<string>();
  for (const l of lines) {
    if (!l || typeof l.serviceName !== "string" || !l.serviceName) return { error: "Ugyldig tjeneste." };
    const addons = Array.isArray(l.addonNames) ? l.addonNames : [];
    if (addons.length > MAX_ADDONS_PER_LINE || addons.some((a) => typeof a !== "string"))
      return { error: "Ugyldige tillegg." };
    names.add(l.serviceName);
    addons.forEach((a) => names.add(a));
  }
  const { data, error } = await sb
    .from("services")
    .select("name, duration_min")
    .in("name", Array.from(names));
  if (error) return { error: "Kunne ikke hente tjenestene. Prøv igjen." };
  const dur = new Map<string, number>();
  for (const r of (data ?? []) as { name: string; duration_min: number | null }[]) {
    if (!dur.has(r.name)) dur.set(r.name, Math.max(0, Number(r.duration_min) || 0));
  }

  const known = new Set(barbers.map((b) => b.name));
  const out: CartLineInput[] = [];
  for (const l of lines) {
    const addons = Array.isArray(l.addonNames) ? l.addonNames : [];
    if (!dur.has(l.serviceName) || addons.some((a) => !dur.has(a))) return { error: "Ukjent tjeneste." };
    const barberName = typeof l.barberName === "string" && l.barberName ? l.barberName : null;
    if (barberName) {
      if (!known.has(barberName)) return { error: "Ukjent barber." };
      if ((exclusions[l.serviceName] ?? []).includes(barberName))
        return { error: "Den barberen utfører ikke denne tjenesten. Velg en annen barber." };
    }
    const extra = addons.reduce((sum, a) => sum + (dur.get(a) ?? 0), 0);
    out.push({
      serviceName: l.serviceName,
      serviceMinutes: dur.get(l.serviceName) ?? 0,
      addonMinutes: Math.min(240, Math.max(0, extra)),
      addonNames: addons,
      barberName,
      person: typeof l.person === "string" ? l.person.trim().slice(0, 40) : undefined,
    });
  }
  return { lines: out };
}

/**
 * Felles ledige starttider for hele kurven, gruppert per dato.
 *  - single: én person, samme barber, tjenestene etter hverandre
 *            (varighet = sum). «Hvilken som helst» = union over barbere som
 *            kan ta ALLE tjenestene.
 *  - group:  flere personer samtidig, hver sin (spesifikke) barber. En tid er
 *            ledig når ALLE linjenes barbere er ledige samtidig.
 */
export async function getCartSlots(
  lines: CartLineInput[],
  mode: CartMode,
  fromISO: string,
  toISO: string,
): Promise<{ byDate: Record<string, string[]>; error?: boolean }> {
  if (!Array.isArray(lines) || !lines.length || !DATE_RE.test(fromISO ?? "") || !DATE_RE.test(toISO ?? ""))
    return { byDate: {} };
  if (lines.length > MAX_LINES) return { byDate: {} };
  // Klem tidsrommet: ikke før i dag, ikke lenger enn ett år frem.
  const today = osloTodayISO();
  const lastDay = addDaysISO(today, MAX_DAYS_AHEAD);
  const from = fromISO < today ? today : fromISO;
  const to = toISO > lastDay ? lastDay : toISO;
  if (to < from) return { byDate: {} };
  try {
    const sb = await createClient();
    const barbers = await getPublicBarbers();
    const exclusions = await getPublicServiceExclusions();
    const resolved = await resolveLines(sb, lines, barbers, exclusions);
    if ("error" in resolved) return { byDate: {}, error: true };
    lines = resolved.lines;

    // Delt opp i bolker (RPC-en returnerer tomt over 60 dager) og slå sammen.
    const chunks: { from: string; to: string }[] = [];
    for (let s = from; s <= to; s = addDaysISO(s, RANGE_CHUNK_DAYS + 1)) {
      const e = addDaysISO(s, RANGE_CHUNK_DAYS);
      chunks.push({ from: s, to: e > to ? to : e });
    }

    async function slotsFor(
      barber: string,
      minutes: number,
    ): Promise<Record<string, string[]>> {
      const parts = await Promise.all(
        chunks.map(async (c) => {
          const { data, error } = await sb.rpc("available_slots_dur_range", {
            p_barber: barber,
            p_minutes: minutes,
            p_from: c.from,
            p_to: c.to,
          });
          // Feil må ikke se ut som «ingen ledige tider» – kast så veiviseren viser feil.
          if (error) throw new Error(error.message);
          return (data as { slot_date: string; slot_time: string }[]) ?? [];
        }),
      );
      const byDate: Record<string, string[]> = {};
      for (const rows of parts) {
        for (const r of rows) (byDate[r.slot_date] ??= []).push(r.slot_time);
      }
      return byDate;
    }

    if (mode === "single") {
      const total = lines.reduce((s, l) => s + lineMinutes(l), 0);
      // Kandidat-barbere: eksplisitt valgt (første linje), ellers de som kan ALLE.
      const chosen = lines.find((l) => l.barberName)?.barberName ?? null;
      let candidates: string[];
      if (chosen) {
        candidates = [chosen];
      } else {
        const perLine = await Promise.all(
          lines.map((l) => eligibleBarbers(l.serviceName, barbers, exclusions)),
        );
        candidates = perLine.reduce((acc, cur) =>
          acc.filter((n) => cur.includes(n)),
        );
      }
      const union: Record<string, Set<string>> = {};
      for (const b of candidates) {
        const bd = await slotsFor(b, total);
        for (const [d, ts] of Object.entries(bd)) {
          union[d] ??= new Set<string>();
          ts.forEach((t) => union[d].add(t));
        }
      }
      const byDate: Record<string, string[]> = {};
      for (const [d, set] of Object.entries(union)) {
        byDate[d] = Array.from(set).sort();
      }
      return { byDate };
    }

    // group: hver linje må ha spesifikk barber; snitt av alle linjenes tider.
    const perLine = await Promise.all(
      lines.map((l) =>
        l.barberName
          ? slotsFor(l.barberName, lineMinutes(l))
          : Promise.resolve({} as Record<string, string[]>),
      ),
    );
    if (lines.some((l) => !l.barberName)) return { byDate: {} };
    const dates = new Set<string>();
    perLine.forEach((bd) => Object.keys(bd).forEach((d) => dates.add(d)));
    const byDate: Record<string, string[]> = {};
    for (const d of dates) {
      let common: string[] | null = null;
      for (const bd of perLine) {
        const ts = new Set(bd[d] ?? []);
        common = common ? common.filter((t) => ts.has(t)) : Array.from(ts);
      }
      if (common && common.length) byDate[d] = common.sort();
    }
    return { byDate };
  } catch (e) {
    console.error("getCartSlots feilet:", e instanceof Error ? e.message : e);
    return { byDate: {}, error: true };
  }
}

/**
 * «Finn neste ledige tid»: leter fremover i bolker på 4 uker (maks ~6 mnd)
 * fra og med `fromISO` og returnerer første ledige dato + klokkeslett
 * (hel/halv time, samme som veiviseren viser). null = ingenting funnet.
 */
export async function findNextCartSlot(
  lines: CartLineInput[],
  mode: CartMode,
  fromISO: string,
): Promise<{ date: string; time: string } | null> {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES || !DATE_RE.test(fromISO)) return null;
  const add = addDaysISO;
  let start = fromISO;
  for (let chunk = 0; chunk < 7; chunk++) {
    const end = add(start, 27);
    const res = await getCartSlots(lines, mode, start, end);
    if (res.error) return null;
    const dates = Object.keys(res.byDate).sort();
    for (const d of dates) {
      const t = (res.byDate[d] ?? []).filter((x) => x.endsWith(":00") || x.endsWith(":30")).sort()[0];
      if (t) return { date: d, time: t };
    }
    start = add(end, 1);
  }
  return null;
}

export type CartBookingInput = {
  lines: CartLineInput[];
  mode: CartMode;
  date: string; // yyyy-mm-dd
  time: string; // HH:MM (felles starttid)
  name: string;
  email: string;
  phone: string;
  source?: string;
  marketingConsent?: boolean;
  note?: string; // kundens notat til barberen (vises i kassa)
  /** Honeypot – skal alltid være tomt. */
  website?: string;
  /** Språket kunden booket på – bekreftelse og påminnelser sendes på dette. */
  lang?: "no" | "en";
};

/**
 * Oppretter alle bookingene i kurven, koblet via en felles gruppe-ID.
 *  - single: linjene legges etter hverandre hos samme barber fra starttid.
 *  - group:  alle linjene starter på samme tid, hver hos sin barber.
 * Krever at KJØR-I-SUPABASE-BOOKING-GRUPPE.sql er kjørt (create_booking_line).
 */
export async function createBookingGroup(
  input: CartBookingInput,
): Promise<{
  ok?: true;
  error?: string;
  /** "taken" = tiden ble tatt av noen andre → send kunden tilbake til tidsvalg. */
  code?: "taken";
  portalUrl?: string;
  cancelUrl?: string;
  barber?: string;
}> {
  const name = titleCase(String(input.name ?? ""));
  if (!name) return { error: "Navn mangler." };
  if (name.length > 80) return { error: "Navnet er for langt." };
  if (!isValidEmail(input.email) || input.email.length > 254) return { error: "Ugyldig e-postadresse." };
  if (!isValidNorwegianPhone(input.phone) && !/^\+\d/.test(input.phone))
    return { error: "Ugyldig telefonnummer." };
  if (!input.date || !input.time) return { error: "Dato og tid må velges." };
  if (!DATE_RE.test(input.date) || !TIME_RE.test(input.time)) return { error: "Ugyldig dato eller klokkeslett." };
  {
    const today = osloTodayISO();
    if (input.date < today) return { error: "Datoen har allerede vært. Velg en ny tid." };
    if (input.date > addDaysISO(today, MAX_DAYS_AHEAD))
      return { error: "Du kan ikke bestille mer enn ett år frem i tid." };
  }
  if (!Array.isArray(input.lines) || !input.lines.length) return { error: "Kurven er tom." };
  if (input.lines.length > MAX_LINES) return { error: "For mange behandlinger i én bestilling." };

  // Misbruksvern (se src/lib/abuse-guard.ts).
  if (isHoneypotTripped(input.website)) {
    // Robot: lat som alt gikk bra, lagre ingenting.
    return { ok: true };
  }
  if (await ipRateLimited()) {
    return { error: "For mange forsøk på kort tid. Prøv igjen om en liten stund, eller ring oss." };
  }
  if (await customerBookingLimited(input.email, input.phone)) {
    return {
      error:
        "Du har allerede mange kommende timer hos oss. Ring oss på +47 463 58 764 hvis du trenger flere.",
    };
  }

  try {
    const sb = await createClient();
    const barbers = await getPublicBarbers();
    const exclusions = await getPublicServiceExclusions();
    // Varighet og tillegg regnes ut på serveren – klientens tall ignoreres.
    const resolved = await resolveLines(sb, input.lines, barbers, exclusions);
    if ("error" in resolved) return { error: resolved.error };
    const lines = resolved.lines;
    // Gruppe-ID kun når det faktisk er flere linjer (ellers vises «Del av
    // gruppebooking» i kassa på helt vanlige enkeltbookinger).
    const group = lines.length > 1 ? randomUUID() : null;
    const noteClean = (input.note ?? "").trim().slice(0, 500) || null;
    // Starttid tolkes som Oslo-tid uansett hvor serveren kjører (Vercel = UTC).
    const baseStart = new Date(osloToUtcISO(input.date, input.time));

    const TAKEN = {
      error: "Beklager – den tiden ble nettopp tatt. Velg en ny tid.",
      code: "taken" as const,
    };

    /** Er `minutes` ledige fra valgt starttid hos barberen (samme regel som tidene kunden ser)? */
    async function isFree(barber: string, minutes: number): Promise<boolean> {
      const { data } = await sb.rpc("available_slots_dur", {
        p_barber: barber,
        p_minutes: minutes,
        p_date: input.date,
      });
      return ((data as string[]) ?? []).includes(input.time);
    }

    // Bygg linjene som skal lagres (barber, start, hvor mye som må være ledig).
    type Row = {
      service: string;
      barber: string;
      start: string;
      person: string | null;
      addonNames: string[];
      extra_min: number;
      check_min: number;
    };
    const rows: Row[] = [];
    let resolvedBarber: string | null = null; // faktisk barber (single-modus)

    if (input.mode === "single") {
      const total = lines.reduce((s, l) => s + lineMinutes(l), 0);
      const chosen = lines.find((l) => l.barberName)?.barberName ?? null;
      let candidates: string[];
      if (chosen) {
        candidates = [chosen];
      } else {
        const perLine = await Promise.all(
          lines.map((l) => eligibleBarbers(l.serviceName, barbers, exclusions)),
        );
        candidates = perLine.reduce((acc, cur) => acc.filter((n) => cur.includes(n)));
      }
      if (candidates.length === 1) {
        if (await isFree(candidates[0], total)) resolvedBarber = candidates[0];
      } else {
        // «Hvem som helst»: blant de ledige, barberen med færrest bookinger
        // den dagen (så en travel barber ikke også får «første ledige»-kundene).
        // Likt antall → færrest minutter → opprinnelig rekkefølge.
        const [free, load] = await Promise.all([
          Promise.all(candidates.map((b) => isFree(b, total))),
          (async () => {
            const m = new Map<string, { bookings: number; minutes: number }>();
            try {
              const { data, error } = await sb.rpc("barber_day_load", { p_date: input.date });
              if (error) {
                // KJØR-I-SUPABASE-FORDEL-LEDIG-BARBER.sql ikke kjørt ennå → første ledige.
                console.warn("barber_day_load feilet:", error.message);
              } else {
                for (const r of (data as { barber: string; bookings: number; minutes: number }[]) ?? [])
                  m.set(r.barber, { bookings: r.bookings ?? 0, minutes: r.minutes ?? 0 });
              }
            } catch (e) {
              console.warn("barber_day_load feilet:", e);
            }
            return m;
          })(),
        ]);
        let best: { b: string; bookings: number; minutes: number } | null = null;
        for (let i = 0; i < candidates.length; i++) {
          if (!free[i]) continue;
          const b = candidates[i];
          const l = load.get(b) ?? { bookings: 0, minutes: 0 };
          if (
            !best ||
            l.bookings < best.bookings ||
            (l.bookings === best.bookings && l.minutes < best.minutes)
          )
            best = { b, ...l };
        }
        resolvedBarber = best?.b ?? null;
      }
      if (!resolvedBarber) return TAKEN;
      let cursor = new Date(baseStart);
      lines.forEach((l, i) => {
        rows.push({
          service: l.serviceName,
          barber: resolvedBarber as string,
          start: cursor.toISOString(),
          person: l.person || null,
          addonNames: l.addonNames,
          extra_min: l.addonMinutes || 0,
          // Første linje sjekker hele blokka; resten ligger rett etter.
          check_min: i === 0 ? total : 0,
        });
        cursor = new Date(cursor.getTime() + lineMinutes(l) * 60000);
      });
    } else {
      for (const l of lines) {
        if (!l.barberName) return { error: "Velg barber for hver person i gruppen." };
        rows.push({
          service: l.serviceName,
          barber: l.barberName,
          start: baseStart.toISOString(),
          person: l.person || null,
          addonNames: l.addonNames,
          extra_min: l.addonMinutes || 0,
          check_min: lineMinutes(l),
        });
      }
    }

    const withAddons = await Promise.all(
      rows.map(async (r) => ({ ...r, addons: await addonServiceIds(sb, r.addonNames) })),
    );

    let created: string[] = [];
    // Alt-eller-ingenting i databasen (KJØR-I-SUPABASE-BOOKING-ATOMISK.sql).
    const { data: ids, error: groupErr } = await sb.rpc("create_booking_group", {
      p_lines: withAddons.map((r) => ({
        service: r.service,
        barber: r.barber,
        start: r.start,
        person: r.person,
        addons: r.addons,
        extra_min: r.extra_min,
        check_min: r.check_min,
      })),
      p_name: name,
      p_email: input.email.trim(),
      p_phone: input.phone.trim(),
      p_source: input.source?.trim() || null,
      p_group: group,
      p_notes: noteClean,
    });

    if (!groupErr) {
      created = ((ids as string[] | null) ?? []).filter(Boolean);
    } else if (/SLOT_TAKEN/.test(groupErr.message)) {
      return TAKEN;
    } else if (
      groupErr.code === "PGRST202" ||
      /create_booking_group/.test(groupErr.message)
    ) {
      // SQL-en er ikke kjørt ennå → gammel vei, men sjekk at tiden er ledig først.
      for (const r of withAddons) {
        if (r.check_min > 0 && !(await isFree(r.barber, r.check_min))) return TAKEN;
      }
      for (const r of withAddons) {
        const { data: id, error } = await sb.rpc("create_booking_line", {
          p_service: r.service,
          p_barber: r.barber,
          p_start: r.start,
          p_name: name,
          p_email: input.email.trim(),
          p_phone: input.phone.trim(),
          p_source: input.source?.trim() || null,
          p_group: group,
          p_person: r.person,
          p_addons: r.addons,
          p_extra_min: r.extra_min,
          p_notes: noteClean,
        });
        if (error) {
          console.error("create_booking_line feilet:", error.message);
          return { error: "Kunne ikke lagre hele bestillingen. Ring oss, så ordner vi det." };
        }
        if (id) created.push(id as string);
      }
    } else {
      console.error("create_booking_group feilet:", groupErr.message);
      return { error: "Kunne ikke lagre bestillingen. Prøv igjen, eller ring oss." };
    }

    if (!created.length) return { error: "Kunne ikke lagre bestillingen." };

    // Lenker + e-post basert på første booking (gjelder hele gruppa/kunden).
    const base = siteUrl();
    let portalUrl: string | undefined;
    let cancelUrl: string | undefined;
    const first = created[0];
    const { data: pToken } = await sb.rpc("portal_token_for_booking", {
      p_booking: first,
    });
    if (pToken) portalUrl = `${base}/min-side/${pToken}`;
    const { data: cToken } = await sb.rpc("booking_cancel_token", {
      p_booking: first,
    });
    if (cToken) cancelUrl = `${base}/avbestill/${cToken}`;

    // Innlogget kunde: merk timene med kundeklubb-nivå og rabatt, så kassa
    // trekker rabatten automatisk. Databasen sjekker at timene faktisk
    // tilhører den innloggede kunden.
    try {
      const token = await getCustomerToken();
      if (token) await sb.rpc("mark_member_booking", { p_token: token, p_bookings: created });
    } catch {
      /* SQL ikke kjørt ennå – vanlig pris */
    }

    // QR-tilbud (skannet kode i informasjonskapselen): legg rabatten på timene.
    // Første linje = den som booker; i gruppebooking får resten venne-rabatten.
    try {
      const promoSlug = await getPromoSlug();
      if (promoSlug) {
        await sb.rpc("mark_promo_booking", {
          p_slug: promoSlug,
          p_bookings: created,
          p_group: input.mode === "group",
        });
      }
    } catch {
      /* SQL ikke kjørt ennå – vanlig pris */
    }

    // Husk kundens språk (customers.lang) til påminnelser og kvitteringer.
    const lang = input.lang ? normLang(input.lang) : await getRequestLang();
    try {
      await sb.rpc("set_customer_lang_for_booking", { p_booking: first, p_lang: lang });
    } catch {
      /* SQL ikke kjørt ennå – norsk som før */
    }
    const en = lang === "en";

    if (input.marketingConsent === true) {
      try {
        await sb.rpc("set_marketing_consent_for_booking", { p_booking: first });
      } catch {
        /* må aldri velte bookingen */
      }
    }

    // Bekreftelse: ett sammendrag av alt kunden booket.
    const summary = lines
      .map((l) => l.serviceName + (l.addonNames.length ? ` + ${l.addonNames.join(", ")}` : ""))
      .join(" · ");
    try {
      await sendBookingConfirmation({
        to: input.email.trim(),
        name,
        // Norsk tjenestenavn – e-posten oversetter selv (og lager språklenken).
        service: summary,
        lang,
        group: input.mode === "group",
        barber:
          input.mode === "group"
            ? ""
            : (barbers.find((b) => b.name === resolvedBarber)?.display ?? resolvedBarber ?? ""),
        barberTitle:
          input.mode === "group" ? undefined : barbers.find((b) => b.name === resolvedBarber)?.title,
        barberPhotoUrl:
          input.mode === "group" ? undefined : (barbers.find((b) => b.name === resolvedBarber)?.photo ?? undefined),
        date: input.date,
        time: input.time,
        price: "",
        cancelUrl,
        portalUrl,
      });
    } catch {
      /* e-post skal aldri velte en lagret booking */
    }

    // Bekreftelse på SMS. Varighet = sum av behandlingene i handlekurven.
    try {
      const names = Array.from(new Set(lines.flatMap((l) => [l.serviceName, ...l.addonNames])));
      const { data: svcs } = await sb.from("services").select("name, duration_min").in("name", names);
      const dur = new Map(((svcs ?? []) as { name: string; duration_min: number | null }[]).map((x) => [x.name, x.duration_min ?? 0]));
      const total = input.mode === "group"
        ? 0
        : lines.reduce(
            (sum, l) => sum + (dur.get(l.serviceName) ?? 0) + l.addonNames.reduce((a, n) => a + (dur.get(n) ?? 0), 0),
            0,
          );
      await sendBookingConfirmationSms({
        phone: input.phone,
        name,
        service: summary,
        lang,
        durationMin: total || null,
        barber:
          input.mode === "group"
            ? en ? "several barbers" : "flere barbere"
            : (barbers.find((b) => b.name === resolvedBarber)?.display ?? resolvedBarber ?? ""),
        startIso: osloToUtcISO(input.date, input.time),
        bookingId: first ?? null,
      });
    } catch {
      /* SMS skal aldri velte en lagret booking */
    }

    // Varsle salongen (innstilling: settings.booking_notify). Aldri blokkerende.
    try {
      const { data: cfg } = await sb
        .from("settings")
        .select("value")
        .eq("key", "booking_notify")
        .maybeSingle();
      const v = (cfg?.value ?? null) as { enabled?: boolean; email?: string } | null;
      if (v?.enabled && v.email) {
        const barberFor = (l: CartLineInput) =>
          input.mode === "group" ? l.barberName : resolvedBarber;
        const whenDate = new Date(`${input.date}T12:00:00Z`).toLocaleDateString("nb-NO", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        });
        await sendNewBookingAlert({
          to: v.email,
          customer: name,
          phone: input.phone.trim(),
          email: input.email.trim(),
          when: `${whenDate.charAt(0).toUpperCase()}${whenDate.slice(1)} kl. ${input.time}`,
          lines: lines.map(
            (l) =>
              l.serviceName +
              (l.addonNames.length ? ` + ${l.addonNames.join(", ")}` : "") +
              ` – ${barberFor(l) ?? "første ledige"}`,
          ),
          note: noteClean,
          calendarUrl: `${base}/kasse/kalender?date=${input.date}`,
        });
      }
    } catch {
      /* varsling skal aldri velte en lagret booking */
    }

    return {
      ok: true,
      portalUrl,
      cancelUrl,
      barber:
        input.mode === "single"
          ? (barbers.find((b) => b.name === resolvedBarber)?.display ?? resolvedBarber ?? undefined)
          : undefined,
    };
  } catch {
    return { error: "Noe gikk galt. Prøv igjen." };
  }
}

/** Slår opp tjeneste-id-ene for tilleggsnavn (for create_booking_line). */
async function addonServiceIds(
  sb: Awaited<ReturnType<typeof createClient>>,
  names: string[],
): Promise<string[]> {
  if (!names.length) return [];
  const { data } = await sb
    .from("services")
    .select("id, name")
    .in("name", names);
  return ((data as { id: string; name: string }[]) ?? []).map((r) => r.id);
}
