"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

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

/** Skru «Bookbar på nett» av/på per tjeneste (skilt fra `active`). Kun admin. */
export async function toggleOnlineBookable(id: string, online_bookable: boolean) {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;
  const sb = await createClient();
  await sb.from("services").update({ online_bookable }).eq("id", id);
  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
}

/**
 * Sett/fjern behandlingsunntak: `excluded = true` betyr at barberen IKKE
 * utfører tjenesten. Kun admin.
 */
export async function setServiceExclusion(
  serviceId: string,
  staffId: string,
  excluded: boolean,
) {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;
  const sb = await createClient();
  if (excluded) {
    await sb
      .from("staff_service_exclusions")
      .upsert(
        { service_id: serviceId, staff_id: staffId },
        { onConflict: "staff_id,service_id" },
      );
  } else {
    await sb
      .from("staff_service_exclusions")
      .delete()
      .eq("service_id", serviceId)
      .eq("staff_id", staffId);
  }
  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
}
