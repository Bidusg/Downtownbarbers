"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setBudget(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const target_nok = Number(formData.get("target_nok") ?? 0);
  if (!staff_id || !year || !month) return;
  await sb
    .from("budgets")
    .upsert(
      { staff_id, year, month, target_nok: Number.isFinite(target_nok) ? target_nok : 0 },
      { onConflict: "staff_id,year,month" },
    );
  revalidatePath("/admin/budsjett");
}

export async function deleteBudget(id: string) {
  const sb = await createClient();
  await sb.from("budgets").delete().eq("id", id);
  revalidatePath("/admin/budsjett");
}
