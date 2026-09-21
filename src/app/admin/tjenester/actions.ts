"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

export async function createService(formData: FormData) {
  const sb = await createClient();
  const { data: inserted } = await sb
    .from("services")
    .insert({
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      price_nok: Number(formData.get("price_nok") ?? 0),
      duration_min: Number(formData.get("duration_min") ?? 30),
      category_id: String(formData.get("category_id") ?? "") || null,
      active: true,
    })
    .select("id")
    .single();

  // Ny tjeneste leveres av alle aktive ansatte som standard (bevarer «alle
  // leverer med mindre annet er valgt»-oppførselen fra ekskluderingsmodellen).
  // Ansatte som leverer «alt» (ingen rader) forblir uendret.
  if (inserted?.id) {
    const { data: staff } = await sb
      .from("staff")
      .select("id")
      .eq("active", true);
    const withRows = new Set<string>();
    const { data: existing } = await sb
      .from("staff_services")
      .select("staff_id");
    for (const r of (existing ?? []) as { staff_id: string }[])
      withRows.add(r.staff_id);
    const rows = (staff ?? [])
      .map((s) => s.id as string)
      .filter((sid) => withRows.has(sid))
      .map((sid) => ({ staff_id: sid, service_id: inserted.id as string }));
    if (rows.length > 0) {
      await sb
        .from("staff_services")
        .upsert(rows, { onConflict: "staff_id,service_id" });
    }
  }

  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
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

  // Aktivering: hvis ingen leverer tjenesten (0 staff_services-rader, f.eks. en
  // gammel/reaktivert tjeneste), knytt den til alle ansatte som har en positiv
  // tjenesteliste – så den ikke blir usynlig i booking. Ansatte som leverer
  // «alt» (ingen rader) berøres ikke.
  if (active) {
    const { data: existingForService } = await sb
      .from("staff_services")
      .select("staff_id")
      .eq("service_id", id)
      .limit(1);
    if (!existingForService || existingForService.length === 0) {
      const { data: withRows } = await sb
        .from("staff_services")
        .select("staff_id");
      const staffIds = Array.from(
        new Set((withRows ?? []).map((r) => r.staff_id as string)),
      );
      const rows = staffIds.map((sid) => ({ staff_id: sid, service_id: id }));
      if (rows.length > 0) {
        await sb
          .from("staff_services")
          .upsert(rows, { onConflict: "staff_id,service_id" });
      }
    }
  }

  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
}

export async function deleteService(id: string) {
  const sb = await createClient();
  await sb.from("services").delete().eq("id", id);
  revalidatePath("/admin/tjenester");
}

/** Skru «Bookbar på nett» av/på per tjeneste (skilt fra `active`). Kun admin. */
export async function toggleOnlineBookable(id: string, online_bookable: boolean) {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
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
  if (!me || !isAdminRole(me.role)) return;
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
