"use server";

import { autoTranslateAfterSave } from "@/lib/auto-translate";

import { refreshSiteConfig } from "@/lib/site-cache-actions";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

type ActionResult = { ok?: true; error?: string };

/** Uten engelske kolonner (SQL ikke kjørt) lagres resten likevel. */
function withoutEn<T extends { name_en: unknown; description_en: unknown }>(row: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name_en, description_en, ...rest } = row;
  return rest;
}
const missingEnCol = (msg: string) => /name_en|description_en/.test(msg);

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
        name_en: string | null;
        description_en: string | null;
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
      name_en: String(formData.get("name_en") ?? "").trim() || null,
      description_en: String(formData.get("description_en") ?? "").trim() || null,
    },
  };
}

export async function createService(formData: FormData): Promise<ActionResult> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const parsed = readServiceForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const sb = await createClient();
  // Ny tjeneste havner nederst (kan flyttes under «Rekkefølge»).
  let nextSort = 0;
  try {
    const { data: last } = await sb
      .from("services")
      .select("sort_order")
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    nextSort = (Number((last as { sort_order?: number } | null)?.sort_order) || 0) + 10;
  } catch {
    /* uten sort_order: som før */
  }
  let { data: inserted, error } = await sb
    .from("services")
    .insert({ ...parsed.row, active: true, ...(nextSort ? { sort_order: nextSort } : {}) })
    .select("id")
    .single();
  if (error && missingEnCol(error.message)) {
    ({ data: inserted, error } = await sb
      .from("services")
      .insert({ ...withoutEn(parsed.row), active: true, ...(nextSort ? { sort_order: nextSort } : {}) })
      .select("id")
      .single());
  }
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
  refreshSiteConfig();
  revalidatePath("/", "layout");
  await autoTranslateAfterSave();
  return { ok: true };
}

export async function updateService(id: string, formData: FormData): Promise<ActionResult> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const parsed = readServiceForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const sb = await createClient();
  let { error } = await sb.from("services").update(parsed.row).eq("id", id);
  if (error && missingEnCol(error.message)) {
    ({ error } = await sb.from("services").update(withoutEn(parsed.row)).eq("id", id));
  }
  if (error) return { error: `Kunne ikke lagre endringene: ${error.message}` };
  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
  refreshSiteConfig();
  revalidatePath("/", "layout");
  await autoTranslateAfterSave();
  return { ok: true };
}

export async function toggleService(id: string, active: boolean) {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
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
  refreshSiteConfig();
}

export async function deleteService(id: string) {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
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
  refreshSiteConfig();
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
  refreshSiteConfig();
}

/* ------------------------- REKKEFØLGE ------------------------- */

/**
 * Lagre rekkefølgen på kategorier og tjenester (booking, forside, kasse).
 * `categoryIds` i ønsket rekkefølge; `serviceIds` i ønsket rekkefølge
 * (gruppert per kategori). Kun admin.
 */
export async function saveServiceOrder(
  categoryIds: string[],
  serviceIds: string[],
): Promise<ActionResult> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  const cats = Array.from(new Set((categoryIds ?? []).filter((x) => typeof x === "string" && x)));
  const svcs = Array.from(new Set((serviceIds ?? []).filter((x) => typeof x === "string" && x)));
  if (!svcs.length) return { error: "Ingen tjenester." };
  const sb = await createClient();
  for (let i = 0; i < cats.length; i++) {
    const { error } = await sb.from("service_categories").update({ sort_order: i + 1 }).eq("id", cats[i]);
    if (error) return { error: `Kunne ikke lagre kategori-rekkefølgen: ${error.message}` };
  }
  for (let i = 0; i < svcs.length; i++) {
    const { error } = await sb.from("services").update({ sort_order: (i + 1) * 10 }).eq("id", svcs[i]);
    if (error) return { error: `Kunne ikke lagre rekkefølgen: ${error.message}` };
  }
  revalidatePath("/admin/tjenester");
  revalidatePath("/booking");
  revalidatePath("/kasse");
  refreshSiteConfig();
  revalidatePath("/", "layout");
  return { ok: true };
}
