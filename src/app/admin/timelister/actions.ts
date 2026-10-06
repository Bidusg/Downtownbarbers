"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Bulk-turnus: sett arbeidstid for flere ukedager (og paritet) på én gang.
 * F.eks. man–fre 09–17. Kan valgfritt erstatte eksisterende vakter for de
 * valgte dagene (samme paritet) først. Kun admin/eier.
 */
export async function bulkSetStaffHours(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };

  const staff_id = String(formData.get("staff_id") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  let week_parity = Number(formData.get("week_parity"));
  if (!(Number.isInteger(week_parity) && week_parity >= 0 && week_parity <= 6))
    week_parity = 0;
  const replace = formData.get("replace") === "on";
  const days = WEEKDAYS.filter((d) => formData.get(`d${d}`) === "on");
  // Gjelder fra (valgfri): turnusen starter denne datoen. Tom = med en gang.
  const rawFrom = String(formData.get("valid_from") ?? "").trim();
  const valid_from = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : null;

  if (!staff_id) return { error: "Velg en ansatt." };
  if (days.length === 0) return { error: "Velg minst én ukedag." };
  if (!start_time || !end_time || end_time <= start_time)
    return { error: "Sett gyldig start/slutt (slutt etter start)." };

  const sb = await createClient();

  // Erstatt FRA en dato: eksisterende vakter for de valgte dagene avsluttes
  // dagen før (historikk og bookinger frem til da beholdes), og vakter som
  // selv skulle starte på/etter datoen fjernes.
  if (replace && valid_from) {
    const dayBefore = new Date(valid_from + "T12:00:00Z");
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const until = dayBefore.toISOString().slice(0, 10);
    let del = sb.from("staff_hours").delete().eq("staff_id", staff_id).in("weekday", days).gte("valid_from", valid_from);
    del = week_parity === 0 ? del : del.in("week_parity", [0, week_parity]);
    const { error: e1 } = await del;
    if (e1) return { error: `Kunne ikke rydde eksisterende: ${e1.message}` };
    let upd = sb
      .from("staff_hours")
      .update({ valid_to: until })
      .eq("staff_id", staff_id)
      .in("weekday", days)
      .or(`valid_to.is.null,valid_to.gte.${valid_from}`);
    upd = week_parity === 0 ? upd : upd.in("week_parity", [0, week_parity]);
    const { error: e2 } = await upd;
    if (e2) return { error: `Kunne ikke avslutte gammel turnus: ${e2.message}` };
  }

  // Erstatt med en gang: slett eksisterende vakter for valgte dager med samme
  // paritet (0 = «hver uke» treffer begge, ellers kun den valgte pariteten).
  if (replace && !valid_from) {
    let del = sb.from("staff_hours").delete().eq("staff_id", staff_id).in("weekday", days);
    del = week_parity === 0 ? del : del.in("week_parity", [0, week_parity]);
    const { error: delErr } = await del;
    if (delErr) return { error: `Kunne ikke rydde eksisterende: ${delErr.message}` };
  }

  // Ingen krasj med vakter som fortsatt gjelder (etter evt. erstatning).
  for (const weekday of days) {
    const clash = await turnusConflict(sb, staff_id, weekday, week_parity, start_time.slice(0, 5), end_time.slice(0, 5), valid_from);
    if (clash) {
      const names = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
      return { error: `${names[weekday][0].toUpperCase() + names[weekday].slice(1)}: ${clash} Kryss av «Erstatt eksisterende» for å bytte.` };
    }
  }

  const rows = days.map((weekday) => ({
    staff_id,
    weekday,
    start_time,
    end_time,
    week_parity,
    ...(valid_from ? { valid_from } : {}),
  }));
  const { error } = await sb.from("staff_hours").insert(rows);
  if (error) {
    if (/valid_from|valid_to/.test(error.message))
      return { error: "Kjør KJØR-I-SUPABASE-TURNUS-FRA-DATO.sql i Supabase først (startdato-støtte)." };
    return { error: `Kunne ikke lagre turnus: ${error.message}` };
  }
  revalidatePath("/");
  revalidatePath("/booking");

  revalidatePath("/admin/timelister");
  return { ok: true };
}

/**
 * Legg til en booking-blokkering (admin sperrer tid for alle ansatte).
 * Hele dagen (ingen tid) eller et tidsintervall. Kun admin/eier.
 */
export async function createBookingBlock(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };

  const block_date = String(formData.get("block_date") ?? "");
  const wholeDay = formData.get("whole_day") === "on";
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(block_date))
    return { error: "Velg en gyldig dato." };
  if (!wholeDay && (!start_time || !end_time || end_time <= start_time))
    return { error: "Sett gyldig tidsintervall, eller velg hele dagen." };

  const sb = await createClient();
  const { error } = await sb.from("booking_blocks").insert({
    block_date,
    start_time: wholeDay ? null : start_time,
    end_time: wholeDay ? null : end_time,
    reason,
  });
  if (error) return { error: `Kunne ikke lagre blokkering: ${error.message}` };

  revalidatePath("/admin/timelister");
  revalidatePath("/booking");
  return { ok: true };
}

export async function deleteBookingBlock(id: string) {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
  const sb = await createClient();
  await sb.from("booking_blocks").delete().eq("id", id);
  revalidatePath("/admin/timelister");
  revalidatePath("/booking");
}

type Res = { ok?: true; error?: string };
type Sb = Awaited<ReturnType<typeof createClient>>;

const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);
const overlaps = (a1: string, a2: string, b1: string, b2: string) => a1 < b2 && b1 < a2;

function revalidateSchedule() {
  revalidatePath("/admin/timelister");
  revalidatePath("/admin/bookinger");
  revalidatePath("/kasse/kalender");
  revalidatePath("/booking");
  revalidatePath("/");
}

/**
 * Finnes det allerede en turnusvakt for samme ansatt/ukedag som krasjer i tid?
 * Paritet: 0 («hver uke») krasjer med alle; ellers bare 0 og samme uke.
 * Datoperiode (valid_from/valid_to) må også overlappe.
 */
async function turnusConflict(
  sb: Sb,
  staff_id: string,
  weekday: number,
  week_parity: number,
  start: string,
  end: string,
  valid_from: string | null,
  excludeId?: string,
): Promise<string | null> {
  const first = await sb
    .from("staff_hours")
    .select("id, start_time, end_time, week_parity, valid_from, valid_to")
    .eq("staff_id", staff_id)
    .eq("weekday", weekday);
  let rows = first.data as Record<string, unknown>[] | null;
  if (first.error) {
    const fb = await sb.from("staff_hours").select("id, start_time, end_time, week_parity").eq("staff_id", staff_id).eq("weekday", weekday);
    rows = fb.data as Record<string, unknown>[] | null;
  }
  const from = valid_from ?? "0000-01-01";
  for (const r of rows ?? []) {
    if (excludeId && r.id === excludeId) continue;
    const p = Number(r.week_parity ?? 0);
    if (!(week_parity === 0 || p === 0 || p === week_parity)) continue;
    const rTo = (r.valid_to as string | null) ?? "9999-12-31";
    const rFrom = (r.valid_from as string | null) ?? "0000-01-01";
    if (!(rFrom <= "9999-12-31" && rTo >= from)) continue; // periodene overlapper ikke
    const a1 = hhmm(r.start_time as string), a2 = hhmm(r.end_time as string);
    if (overlaps(start, end, a1, a2)) return `Krasjer med eksisterende vakt ${a1}–${a2} samme dag.`;
  }
  return null;
}

export async function createStaffHour(formData: FormData): Promise<Res> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const start_time = hhmm(String(formData.get("start_time") ?? ""));
  const end_time = hhmm(String(formData.get("end_time") ?? ""));
  let week_parity = Number(formData.get("week_parity"));
  if (!(Number.isInteger(week_parity) && week_parity >= 0 && week_parity <= 6))
    week_parity = 0;
  const rawFrom = String(formData.get("valid_from") ?? "").trim();
  const valid_from = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : null;
  if (!staff_id || Number.isNaN(weekday) || !start_time || !end_time) return { error: "Fyll inn ansatt, ukedag og tider." };
  if (end_time <= start_time) return { error: "Slutt må være etter start." };
  const clash = await turnusConflict(sb, staff_id, weekday, week_parity, start_time, end_time, valid_from);
  if (clash) return { error: clash };
  const { error } = await sb
    .from("staff_hours")
    .insert({ staff_id, weekday, start_time, end_time, week_parity, ...(valid_from ? { valid_from } : {}) });
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidateSchedule();
  return { ok: true };
}

export async function deleteStaffHour(id: string) {
  const sb = await createClient();
  await sb.from("staff_hours").delete().eq("id", id);
  revalidateSchedule();
}

/** Endre en eksisterende vakt (tid + paritet) uten å slette og lage ny. */
export async function updateStaffHour(formData: FormData): Promise<Res> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();
  const id = String(formData.get("id") ?? "");
  const start_time = hhmm(String(formData.get("start_time") ?? ""));
  const end_time = hhmm(String(formData.get("end_time") ?? ""));
  let week_parity = Number(formData.get("week_parity"));
  if (!(Number.isInteger(week_parity) && week_parity >= 0 && week_parity <= 6))
    week_parity = 0;
  if (!id || !start_time || !end_time || end_time <= start_time) return { error: "Slutt må være etter start." };
  const { data: cur } = await sb.from("staff_hours").select("staff_id, weekday, valid_from").eq("id", id).maybeSingle();
  if (!cur) return { error: "Fant ikke vakten." };
  const clash = await turnusConflict(
    sb, cur.staff_id as string, Number(cur.weekday), week_parity, start_time, end_time,
    ((cur as Record<string, unknown>).valid_from as string | null) ?? null, id,
  );
  if (clash) return { error: clash };
  const { error } = await sb.from("staff_hours").update({ start_time, end_time, week_parity }).eq("id", id);
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidateSchedule();
  return { ok: true };
}

/** Kopier hele turnusen fra én uke (A/B) til den andre. */
export async function copyTurnusWeek(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const from = Number(formData.get("from"));
  const to = Number(formData.get("to"));
  if (![1, 2].includes(from) || ![1, 2].includes(to) || from === to) return { error: "Ugyldig uke." };
  const sb = await createClient();
  const { error } = await sb.rpc("copy_turnus_week", { p_from: from, p_to: to });
  if (error) return { error: `Kunne ikke kopiere: ${error.message}` };
  revalidateSchedule();
  return { ok: true };
}

/**
 * Krasjer et avvik med et annet avvik samme ansatt/dato?
 *  - «Vakt denne dagen» (extra) kan ikke overlappe en annen vakt samme dag.
 *  - Fri hele dagen kan bare finnes én gang; delvis fri kan ikke overlappe annen fri.
 */
async function exceptionConflict(
  sb: Sb,
  staff_id: string,
  date: string,
  kind: "off" | "extra",
  start: string | null,
  end: string | null,
  excludeId?: string,
): Promise<string | null> {
  const { data } = await sb
    .from("staff_exceptions")
    .select("id, kind, start_time, end_time")
    .eq("staff_id", staff_id)
    .eq("date", date);
  for (const r of data ?? []) {
    if (excludeId && r.id === excludeId) continue;
    if (r.kind !== kind) continue;
    const a1 = hhmm(r.start_time as string | null), a2 = hhmm(r.end_time as string | null);
    if (kind === "extra") {
      if (start && end && a1 && a2 && overlaps(start, end, a1, a2))
        return `Krasjer med vakten ${a1}–${a2} som allerede er satt opp denne dagen.`;
    } else {
      if (!a1 || !start) return "Det er allerede registrert fri denne dagen.";
      if (end && a2 && overlaps(start, end, a1, a2)) return `Krasjer med fri ${a1}–${a2} samme dag.`;
    }
  }
  return null;
}

function readException(formData: FormData) {
  const kind: "off" | "extra" = String(formData.get("kind") ?? "off") === "extra" ? "extra" : "off";
  const rawStart = hhmm(String(formData.get("start_time") ?? "").trim());
  const rawEnd = hhmm(String(formData.get("end_time") ?? "").trim());
  const note = String(formData.get("note") ?? "").trim() || null;
  let start_time: string | null = rawStart || null;
  let end_time: string | null = rawEnd || null;
  let error: string | null = null;
  if (kind === "extra") {
    if (!start_time || !end_time || end_time <= start_time) error = "Sett gyldig tid for vakten (slutt etter start).";
  } else if (start_time && end_time && end_time <= start_time) {
    error = "Ugyldig tidsrom for fri (slutt etter start).";
  }
  // Fri uten begge tider = hele dagen.
  if (kind === "off" && (!start_time || !end_time)) {
    start_time = null;
    end_time = null;
  }
  return { kind, start_time, end_time, note, error };
}

/**
 * Legg til en vakt for én dato (erstatter turnusen den dagen) eller fri
 * (hele/deler av dagen). Avviser tider som krasjer med det som finnes.
 */
export async function createStaffException(formData: FormData): Promise<Res> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!staff_id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Velg ansatt og dato." };
  const ex = readException(formData);
  if (ex.error) return { error: ex.error };
  const clash = await exceptionConflict(sb, staff_id, date, ex.kind, ex.start_time, ex.end_time);
  if (clash) return { error: clash };
  const { error } = await sb
    .from("staff_exceptions")
    .insert({ staff_id, date, kind: ex.kind, start_time: ex.start_time, end_time: ex.end_time, note: ex.note });
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidateSchedule();
  return { ok: true };
}

/** Endre en vakt/fri for én dato (tid, type, dato, notat). */
export async function updateStaffException(id: string, formData: FormData): Promise<Res> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();
  const { data: cur } = await sb.from("staff_exceptions").select("staff_id").eq("id", id).maybeSingle();
  if (!cur) return { error: "Fant ikke vakten." };
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Velg dato." };
  const ex = readException(formData);
  if (ex.error) return { error: ex.error };
  const clash = await exceptionConflict(sb, cur.staff_id as string, date, ex.kind, ex.start_time, ex.end_time, id);
  if (clash) return { error: clash };
  const { error } = await sb
    .from("staff_exceptions")
    .update({ date, kind: ex.kind, start_time: ex.start_time, end_time: ex.end_time, note: ex.note })
    .eq("id", id);
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidateSchedule();
  return { ok: true };
}

export async function deleteStaffException(id: string): Promise<Res> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();
  const { error } = await sb.from("staff_exceptions").delete().eq("id", id);
  if (error) return { error: `Kunne ikke slette: ${error.message}` };
  revalidateSchedule();
  return { ok: true };
}

/** Mandag (YYYY-MM-DD) i inneværende uke, Oslo-tid. */
function mondayOfThisWeekOslo(): string {
  const osloStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
  const [y, m, d] = osloStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = søndag
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}

/**
 * Sett rotasjonsmønster: antall uker (1–6) i turnus-rotasjonen. «Start på nå»
 * (reanchor) setter ankeret til inneværende ukes mandag, så denne uken blir
 * Uke A. Kun admin/eier.
 */
export async function setTurnusRotation(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };

  const weeks = Number(formData.get("weeks"));
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 6)
    return { error: "Antall uker må være mellom 1 og 6." };
  const reanchor = formData.get("reanchor") === "on";

  const sb = await createClient();
  const { data: cur } = await sb
    .from("settings")
    .select("value")
    .eq("key", "turnus_rotation")
    .maybeSingle();
  const existingAnchor = (cur?.value as { anchor?: string })?.anchor;
  const anchor = reanchor || !existingAnchor ? mondayOfThisWeekOslo() : existingAnchor;

  const { error } = await sb
    .from("settings")
    .upsert({ key: "turnus_rotation", value: { weeks, anchor } });
  if (error) return { error: `Kunne ikke lagre rotasjon: ${error.message}` };

  revalidatePath("/admin/timelister");
  revalidatePath("/booking");
  return { ok: true };
}

/** Sett A/B-ankeret: hvilken paritet en partalls ISO-uke er. */
export async function setTurnusAnchor(formData: FormData) {
  const sb = await createClient();
  const aIsEven = String(formData.get("a_is_even")) === "even";
  await sb
    .from("settings")
    .upsert({ key: "turnus_anchor", value: { a_is_even: aIsEven } });
  revalidatePath("/admin/timelister");
}
