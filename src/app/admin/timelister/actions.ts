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
