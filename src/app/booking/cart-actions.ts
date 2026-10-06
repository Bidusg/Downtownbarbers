"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getPublicBarbers } from "@/lib/queries";
import { getPublicServiceExclusions } from "@/lib/service-catalog-queries";
import { sendBookingConfirmation, sendNewBookingAlert } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { osloToUtcISO } from "@/lib/oslo-time";
import { isValidEmail, isValidNorwegianPhone, titleCase } from "@/lib/validate";
import { customerBookingLimited, ipRateLimited, isHoneypotTripped } from "@/lib/abuse-guard";

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
  if (!lines.length || !fromISO || !toISO) return { byDate: {} };
  try {
    const sb = await createClient();
    const barbers = await getPublicBarbers();
    const exclusions = await getPublicServiceExclusions();

    async function slotsFor(
      barber: string,
      minutes: number,
    ): Promise<Record<string, string[]>> {
      const { data } = await sb.rpc("available_slots_dur_range", {
        p_barber: barber,
        p_minutes: minutes,
        p_from: fromISO,
        p_to: toISO,
      });
      const byDate: Record<string, string[]> = {};
      for (const r of (data as { slot_date: string; slot_time: string }[]) ?? []) {
        (byDate[r.slot_date] ??= []).push(r.slot_time);
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
  } catch {
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
  if (!lines.length || !/^\d{4}-\d{2}-\d{2}$/.test(fromISO)) return null;
  const add = (iso: string, n: number) => {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
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
};

/**
 * Oppretter alle bookingene i kurven, koblet via en felles gruppe-ID.
 *  - single: linjene legges etter hverandre hos samme barber fra starttid.
 *  - group:  alle linjene starter på samme tid, hver hos sin barber.
 * Krever at KJØR-I-SUPABASE-BOOKING-GRUPPE.sql er kjørt (create_booking_line).
 */
export async function createBookingGroup(
  input: CartBookingInput,
): Promise<{ ok?: true; error?: string; portalUrl?: string; cancelUrl?: string }> {
  const name = titleCase(input.name);
  if (!name) return { error: "Navn mangler." };
  if (!isValidEmail(input.email)) return { error: "Ugyldig e-postadresse." };
  if (!isValidNorwegianPhone(input.phone) && !/^\+\d/.test(input.phone))
    return { error: "Ugyldig telefonnummer." };
  if (!input.date || !input.time) return { error: "Dato og tid må velges." };
  if (!input.lines.length) return { error: "Kurven er tom." };

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
    // Gruppe-ID kun når det faktisk er flere linjer (ellers vises «Del av
    // gruppebooking» i kassa på helt vanlige enkeltbookinger).
    const group = input.lines.length > 1 ? randomUUID() : null;
    const noteClean = (input.note ?? "").trim().slice(0, 500) || null;
    // Starttid tolkes som Oslo-tid uansett hvor serveren kjører (Vercel = UTC).
    const baseStart = new Date(osloToUtcISO(input.date, input.time));

    // Resolve «hvilken som helst» til konkret barber (single-modus).
    async function resolveSingleBarber(total: number): Promise<string | null> {
      const chosen = input.lines.find((l) => l.barberName)?.barberName ?? null;
      if (chosen) return chosen;
      const perLine = await Promise.all(
        input.lines.map((l) =>
          eligibleBarbers(l.serviceName, barbers, exclusions),
        ),
      );
      const candidates = perLine.reduce((acc, cur) =>
        acc.filter((n) => cur.includes(n)),
      );
      // Første kandidat som er ledig for hele blokka på valgt tid.
      for (const b of candidates) {
        const { data } = await sb.rpc("available_slots_dur", {
          p_barber: b,
          p_minutes: total,
          p_date: input.date,
        });
        if (((data as string[]) ?? []).includes(input.time)) return b;
      }
      return candidates[0] ?? null;
    }

    const created: string[] = [];
    let resolvedBarber: string | null = null; // faktisk barber (single-modus)

    if (input.mode === "single") {
      const total = input.lines.reduce((s, l) => s + lineMinutes(l), 0);
      const barber = await resolveSingleBarber(total);
      if (!barber) return { error: "Ingen barber tilgjengelig for valget." };
      resolvedBarber = barber;
      let cursor = new Date(baseStart);
      for (const l of input.lines) {
        const addonIds = await addonServiceIds(sb, l.addonNames);
        const { data: id, error } = await sb.rpc("create_booking_line", {
          p_service: l.serviceName,
          p_barber: barber,
          p_start: cursor.toISOString(),
          p_name: name,
          p_email: input.email.trim(),
          p_phone: input.phone.trim(),
          p_source: input.source?.trim() || null,
          p_group: group,
          p_person: l.person || null,
          p_addons: addonIds,
          p_extra_min: l.addonMinutes || 0,
          p_notes: noteClean,
        });
        if (error) {
          console.error("create_booking_line feilet:", error.message);
          return { error: "Kunne ikke lagre hele bestillingen. Prøv igjen." };
        }
        if (id) created.push(id as string);
        cursor = new Date(cursor.getTime() + lineMinutes(l) * 60000);
      }
    } else {
      // group: hver linje samme starttid, egen barber.
      for (const l of input.lines) {
        if (!l.barberName)
          return { error: "Velg barber for hver person i gruppen." };
        const addonIds = await addonServiceIds(sb, l.addonNames);
        const { data: id, error } = await sb.rpc("create_booking_line", {
          p_service: l.serviceName,
          p_barber: l.barberName,
          p_start: baseStart.toISOString(),
          p_name: name,
          p_email: input.email.trim(),
          p_phone: input.phone.trim(),
          p_source: input.source?.trim() || null,
          p_group: group,
          p_person: l.person || null,
          p_addons: addonIds,
          p_extra_min: l.addonMinutes || 0,
          p_notes: noteClean,
        });
        if (error) {
          console.error("create_booking_line feilet:", error.message);
          return { error: "Kunne ikke lagre hele bestillingen. Prøv igjen." };
        }
        if (id) created.push(id as string);
      }
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

    if (input.marketingConsent === true) {
      try {
        await sb.rpc("set_marketing_consent_for_booking", { p_booking: first });
      } catch {
        /* må aldri velte bookingen */
      }
    }

    // Bekreftelse: ett sammendrag av alt kunden booket.
    const summary = input.lines
      .map((l) => l.serviceName + (l.addonNames.length ? ` + ${l.addonNames.join(", ")}` : ""))
      .join(" · ");
    try {
      await sendBookingConfirmation({
        to: input.email.trim(),
        name,
        service: summary,
        barber:
          input.mode === "group"
            ? "Flere barbere"
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
          input.mode === "group" ? l.barberName : (input.lines.find((x) => x.barberName)?.barberName ?? null);
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
          lines: input.lines.map(
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

    return { ok: true, portalUrl, cancelUrl };
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
