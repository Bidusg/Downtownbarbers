"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createService(formData: FormData) {
  const sb = await createClient();
  await sb.from("services").insert({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    price_nok: Number(formData.get("price_nok") ?? 0),
    duration_min: Number(formData.get("duration_min") ?? 30),
    category_id: String(formData.get("category_id") ?? "") || null,
    active: true,
  });
  revalidatePath("/admin/tjenester");
}

export async function updateService(id: string, formData: FormData) {
  const sb = await createClient();
  await sb
    .from("services")
    .update({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      price_nok: Number(formData.get("price_nok") ?? 0),
      duration_min: Number(formData.get("duration_min") ?? 30),
      category_id: String(formData.get("category_id") ?? "") || null,
    })
    .eq("id", id);
  revalidatePath("/admin/tjenester");
}

export async function toggleService(id: string, active: boolean) {
  const sb = await createClient();
  await sb.from("services").update({ active }).eq("id", id);
  revalidatePath("/admin/tjenester");
}

export async function deleteService(id: string) {
  const sb = await createClient();
  await sb.from("services").delete().eq("id", id);
  revalidatePath("/admin/tjenester");
}
