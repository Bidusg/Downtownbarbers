"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/**
 * SESONG-KUPONGER — admin utsteder/administrerer medlems-kuponger. Kun admin/
 * eier. Selve rabatten beregnes + valideres server-side ved innløsning i kassa
 * (0060). Her opprettes, aktiveres/deaktiveres og slettes kupongene. Skriving
 * går via member_campaigns-RLS (admin_all).
 */

async function guard(): Promise<boolean> {
  const me = await getUserRole();
  return !!me && isAdminRole(me.role);
}

function cleanDate(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function createCampaign(formData: FormData): Promise<void> {
  if (!(await guard())) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("discount_type") ?? "percent");
  const discountType = type === "fixed" ? "fixed" : "percent";
  let value = Math.max(0, Number(formData.get("discount_value")) || 0);
  if (discountType === "percent") value = Math.min(100, value);
  if (value <= 0) return;
  const minTier = Math.max(0, Math.round(Number(formData.get("min_tier_sort_order")) || 0));
  const oncePerMember = formData.get("once_per_member") != null;

  const sb = await createClient();
  await sb.from("member_campaigns").insert({
    name,
    description: description || null,
    discount_type: discountType,
    discount_value: value,
    min_tier_sort_order: minTier,
    starts_at: cleanDate(formData.get("starts_at")),
    expires_at: cleanDate(formData.get("expires_at")),
    once_per_member: oncePerMember,
    active: true,
  });

  revalidatePath("/admin/kuponger");
}

export async function toggleCampaign(id: string, active: boolean): Promise<void> {
  if (!(await guard())) return;
  if (!id) return;
  const sb = await createClient();
  await sb.from("member_campaigns").update({ active }).eq("id", id);
  revalidatePath("/admin/kuponger");
}

export async function deleteCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await guard())) return { ok: false, error: "Ikke tilgang" };
  if (!id) return { ok: false, error: "Ugyldig kupong" };
  const sb = await createClient();
  const { error } = await sb.from("member_campaigns").delete().eq("id", id);
  if (error) return { ok: false, error: "Kunne ikke slette kupongen" };
  revalidatePath("/admin/kuponger");
  return { ok: true };
}
