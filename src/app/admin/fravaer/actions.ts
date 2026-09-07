"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createAbsence(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const from_date = String(formData.get("from_date") ?? "");
  const to_date = String(formData.get("to_date") ?? "");
  if (!staff_id || !from_date || !to_date) return;
  await sb.from("absences").insert({
    staff_id,
    from_date,
    to_date,
    reason: String(formData.get("reason") ?? "") || null,
  });
  revalidatePath("/admin/fravaer");
}

export async function deleteAbsence(id: string) {
  const sb = await createClient();
  await sb.from("absences").delete().eq("id", id);
  revalidatePath("/admin/fravaer");
}
