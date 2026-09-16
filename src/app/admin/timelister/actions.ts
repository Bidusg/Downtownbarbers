"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createStaffHour(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  let week_parity = Number(formData.get("week_parity"));
  if (![0, 1, 2].includes(week_parity)) week_parity = 0;
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

/** Sett A/B-ankeret: hvilken paritet en partalls ISO-uke er. */
export async function setTurnusAnchor(formData: FormData) {
  const sb = await createClient();
  const aIsEven = String(formData.get("a_is_even")) === "even";
  await sb
    .from("settings")
    .upsert({ key: "turnus_anchor", value: { a_is_even: aIsEven } });
  revalidatePath("/admin/timelister");
}
