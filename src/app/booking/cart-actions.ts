"use server";

import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getPublicBarbers } from "@/lib/queries";
import { getPublicServiceExclusions } from "@/lib/service-catalog-queries";
import { sendBookingConfirmation } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { isValidEmail, isValidNorwegianPhone, titleCase } from "@/lib/validate";

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

  try {
    const sb = await createClient();
    const barbers = await getPublicBarbers();
    const exclusions = await getPublicServiceExclusions();
    const group = randomUUID();
    const baseStart = new Date(`${input.date}T${input.time}:00`);

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

    if (input.mode === "single") {
      const total = input.lines.reduce((s, l) => s + lineMinutes(l), 0);
      const barber = await resolveSingleBarber(total);
      if (!barber) return { error: "Ingen barber tilgjengelig for valget." };
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
        barber: input.mode === "group" ? "Flere barbere" : "",
        date: input.date,
        time: input.time,
        price: "",
        cancelUrl,
        portalUrl,
      });
    } catch {
      /* e-post skal aldri velte en lagret booking */
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
