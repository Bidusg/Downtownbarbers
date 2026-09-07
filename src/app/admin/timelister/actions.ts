"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createStaffHour(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  if (!staff_id || Number.isNaN(weekday) || !start_time || !end_time) return;
  if (end_time <= start_time) return;
  await sb
    .from("staff_hours")
    .insert({ staff_id, weekday, start_time, end_time });
  revalidatePath("/admin/timelister");
}

export async function deleteStaffHour(id: string) {
  const sb = await createClient();
  await sb.from("staff_hours").delete().eq("id", id);
  revalidatePath("/admin/timelister");
}
