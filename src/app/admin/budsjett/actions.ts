"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setBudget(formData: FormData): Promise<{ ok?: true; error?: string }> {
  const staff_id = String(formData.get("staff_id") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const raw = String(formData.get("target_nok") ?? "").trim();
  const target_nok = raw === "" ? 0 : Number(raw);
  if (!staff_id || !Number.isInteger(year) || !(month >= 1 && month <= 12)) {
    return { error: "Ugyldig ansatt eller måned." };
  }
  if (!Number.isFinite(target_nok) || target_nok < 0) {
    return { error: "Målet må være et beløp, 0 eller mer." };
  }
  const sb = await createClient();
  const { error } = await sb
    .from("budgets")
    .upsert(
      { staff_id, year, month, target_nok: Math.round(target_nok) },
      { onConflict: "staff_id,year,month" },
    );
  if (error) return { error: "Kunne ikke lagre: " + error.message };
  revalidatePath("/admin/budsjett");
  return { ok: true };
}

export async function deleteBudget(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("budgets").delete().eq("id", id);
  if (error) return { ok: false, error: "Kunne ikke nullstille: " + error.message };
  revalidatePath("/admin/budsjett");
  return { ok: true };
}
