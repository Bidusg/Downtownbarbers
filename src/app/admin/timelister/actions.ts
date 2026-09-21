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

  if (!staff_id) return { error: "Velg en ansatt." };
  if (days.length === 0) return { error: "Velg minst én ukedag." };
  if (!start_time || !end_time || end_time <= start_time)
    return { error: "Sett gyldig start/slutt (slutt etter start)." };

  const sb = await createClient();

  // Erstatt: slett eksisterende vakter for valgte dager med samme paritet
  // (0 = «hver uke» treffer begge, ellers kun den valgte pariteten).
  if (replace) {
    let del = sb.from("staff_hours").delete().eq("staff_id", staff_id).in("weekday", days);
    del = week_parity === 0 ? del : del.in("week_parity", [0, week_parity]);
    const { error: delErr } = await del;
    if (delErr) return { error: `Kunne ikke rydde eksisterende: ${delErr.message}` };
  }

  const rows = days.map((weekday) => ({
    staff_id,
    weekday,
    start_time,
    end_time,
    week_parity,
  }));
  const { error } = await sb.from("staff_hours").insert(rows);
  if (error) return { error: `Kunne ikke lagre turnus: ${error.message}` };

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

export async function createStaffHour(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  let week_parity = Number(formData.get("week_parity"));
  if (!(Number.isInteger(week_parity) && week_parity >= 0 && week_parity <= 6))
    week_parity = 0;
  if (!staff_id || Number.isNaN(weekday) || !start_time || !end_time) return;
  if (end_time <= start_time) return;
  await sb
    .from("staff_hours")
    .insert({ staff_id, weekday, start_time, end_time, week_parity });
  revalidatePath("/admin/timelister");
}

export async function deleteStaffHour(id: string) {
  const sb = await createClient();
  await sb.from("staff_hours").delete().eq("id", id);
  revalidatePath("/admin/timelister");
}

/** Endre en eksisterende vakt (tid + paritet) uten å slette og lage ny. */
export async function updateStaffHour(formData: FormData) {
  const sb = await createClient();
  const id = String(formData.get("id") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  let week_parity = Number(formData.get("week_parity"));
  if (!(Number.isInteger(week_parity) && week_parity >= 0 && week_parity <= 6))
    week_parity = 0;
  if (!id || !start_time || !end_time || end_time <= start_time) return;
  await sb
    .from("staff_hours")
    .update({ start_time, end_time, week_parity })
    .eq("id", id);
  revalidatePath("/admin/timelister");
}

/** Kopier hele turnusen fra én uke (A/B) til den andre. */
export async function copyTurnusWeek(formData: FormData) {
  const from = Number(formData.get("from"));
  const to = Number(formData.get("to"));
  if (![1, 2].includes(from) || ![1, 2].includes(to) || from === to) return;
  const sb = await createClient();
  await sb.rpc("copy_turnus_week", { p_from: from, p_to: to });
  revalidatePath("/admin/timelister");
}

/** Legg til et avvik/fravær for en barber på en dato (0028). */
export async function createStaffException(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "off") === "extra" ? "extra" : "off";
  const rawStart = String(formData.get("start_time") ?? "").trim();
  const rawEnd = String(formData.get("end_time") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!staff_id || !date) return;

  // 'extra' krever tidsrom. 'off' uten tider = hele dagen fri.
  let start_time: string | null = rawStart || null;
  let end_time: string | null = rawEnd || null;
  if (kind === "extra") {
    if (!start_time || !end_time || end_time <= start_time) return;
  } else if (start_time && end_time && end_time <= start_time) {
    return; // ugyldig delvis fravær
  }
  // Delvis fravær krever begge tider; ellers regnes det som hele dagen.
  if (kind === "off" && (!start_time || !end_time)) {
    start_time = null;
    end_time = null;
  }

  await sb
    .from("staff_exceptions")
    .insert({ staff_id, date, kind, start_time, end_time, note });
  revalidatePath("/admin/timelister");
}

export async function deleteStaffException(id: string) {
  const sb = await createClient();
  await sb.from("staff_exceptions").delete().eq("id", id);
  revalidatePath("/admin/timelister");
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
