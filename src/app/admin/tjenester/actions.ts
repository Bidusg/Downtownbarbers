"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

type ActionResult = { ok?: true; error?: string };

/** Felles validering for opprett/endre tjeneste. */
function readServiceForm(formData: FormData):
  | { error: string }
  | {
      row: {
        name: string;
        description: string;
        price_nok: number;
        duration_min: number;
        category_id: string | null;
      };
    } {
  const name = String(formData.get("name") ?? "").trim();
  const price_nok = Number(formData.get("price_nok") ?? 0);
  const rawDur = String(formData.get("duration_min") ?? "").trim();
  const duration_min = rawDur === "" ? 30 : Number(rawDur);
  if (!name) return { error: "Tjenesten må ha et navn." };
  if (!Number.isFinite(price_nok) || price_nok < 0) return { error: "Ugyldig pris." };
  if (!Number.isInteger(duration_min) || duration_min <= 0)
    return { error: "Varighet må være et helt antall minutter over 0." };
  return {
    row: {
      name,
      description: String(formData.get("description") ?? ""),
      price_nok,
      duration_min,
      category_id: String(formData.get("category_id") ?? "") || null,
    },
  };
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const parsed = readServiceForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const sb = await createClient();
  const { data: inserted, error } = await sb
    .from("services")
    .insert({ ...parsed.row, active: true })
    .select("id")
    .single();
  if (error) return { error: `Kunne ikke lagre tjenesten: ${error.message}` };

  // Ny tjeneste leveres av alle aktive ansatte som standard (fjern avhukingen
  // per ansatt under Ansatte → Rediger).
  if (inserted?.id) {
    const { data: staff } = await sb
      .from("staff")
      .select("id")
      .eq("active", true);
    const rows = (staff ?? [])
      .map((s) => s.id as string)
      .map((sid) => ({ staff_id: sid, service_id: inserted.id as string }));
    if (rows.length > 0) {
      await sb
        .from("staff_services")
        .upsert(rows, { onConflict: "staff_id,service_id" });
    }
  }

  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
  return { ok: true };
}

export async function updateService(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = readServiceForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const sb = await createClient();
  const { error } = await sb.from("services").update(parsed.row).eq("id", id);
  if (error) return { error: `Kunne ikke lagre endringene: ${error.message}` };
  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
  return { ok: true };
}

export async function toggleService(id: string, active: boolean) {
  const sb = await createClient();
  await sb.from("services").update({ active }).eq("id", id);

  // Aktivering: hvis ingen leverer tjenesten (0 staff_services-rader, f.eks. en
  // gammel/reaktivert tjeneste), knytt den til alle aktive ansatte – så den
  // ikke blir usynlig i booking.
  if (active) {
    const { data: existingForService } = await sb
      .from("staff_services")
      .select("staff_id")
      .eq("service_id", id)
      .limit(1);
    if (!existingForService || existingForService.length === 0) {
      const { data: activeStaff } = await sb
        .from("staff")
        .select("id")
        .eq("active", true);
      const staffIds = (activeStaff ?? []).map((r) => r.id as string);
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
