"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSettlement(formData: FormData) {
  const sb = await createClient();
  const settle_date = String(formData.get("settle_date") ?? "");
  const total_nok = Number(formData.get("total_nok") ?? 0);
  if (!settle_date) return;
  const {
    data: { user },
  } = await sb.auth.getUser();
  await sb.from("cash_settlements").insert({
    settle_date,
    total_nok: Number.isFinite(total_nok) ? total_nok : 0,
    note: String(formData.get("note") ?? "") || null,
    opened_by: user?.id ?? null,
  });
  revalidatePath("/admin/kasseoppgjor");
}

export async function deleteSettlement(id: string) {
  const sb = await createClient();
  await sb.from("cash_settlements").delete().eq("id", id);
  revalidatePath("/admin/kasseoppgjor");
}
