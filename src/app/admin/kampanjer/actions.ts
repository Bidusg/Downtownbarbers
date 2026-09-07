"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCampaign(formData: FormData) {
  const sb = await createClient();
  const name = String(formData.get("name") ?? "");
  const channel = String(formData.get("channel") ?? "");
  if (!name || !channel) return;
  const scheduledRaw = String(formData.get("scheduled_at") ?? "");
  await sb.from("campaigns").insert({
    name,
    channel,
    body: String(formData.get("body") ?? "") || null,
    scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
  });
  revalidatePath("/admin/kampanjer");
}

export async function deleteCampaign(id: string) {
  const sb = await createClient();
  await sb.from("campaigns").delete().eq("id", id);
  revalidatePath("/admin/kampanjer");
}
