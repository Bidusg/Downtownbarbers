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

export async function createCampaign(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  if (!(await guard())) return { error: "Ikke tilgang" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Kupongen må ha et navn." };
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("discount_type") ?? "percent");
  const discountType = type === "fixed" ? "fixed" : "percent";
  const value = Math.max(0, Number(formData.get("discount_value")) || 0);
  if (discountType === "percent" && value > 100) return { error: "Prosent kan ikke være over 100." };
  if (value <= 0) return { error: "Rabatten må være over 0." };
  const minTier = Math.max(0, Math.round(Number(formData.get("min_tier_sort_order")) || 0));
  const oncePerMember = formData.get("once_per_member") != null;

  const startsAt = cleanDate(formData.get("starts_at"));
  const expiresAt = cleanDate(formData.get("expires_at"));
  if (startsAt && expiresAt && expiresAt < startsAt) {
    return { error: "Utløpsdatoen kan ikke være før «Gyldig fra»." };
  }

  const sb = await createClient();
  const { error } = await sb.from("member_campaigns").insert({
    name,
    description: description || null,
    discount_type: discountType,
    discount_value: value,
    min_tier_sort_order: minTier,
    starts_at: startsAt,
    expires_at: expiresAt,
    once_per_member: oncePerMember,
    active: true,
  });
  if (error) return { error: `Kunne ikke opprette kupongen: ${error.message}` };

  revalidatePath("/admin/kuponger");
  return { ok: true };
}

export async function updateCampaign(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  if (!(await guard())) return { error: "Ikke tilgang" };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Ugyldig kupong" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Kupongen må ha et navn." };
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("discount_type") ?? "percent");
  const discountType = type === "fixed" ? "fixed" : "percent";
  const value = Math.max(0, Number(formData.get("discount_value")) || 0);
  if (discountType === "percent" && value > 100) return { error: "Prosent kan ikke være over 100." };
  if (value <= 0) return { error: "Rabatten må være over 0." };
  const minTier = Math.max(0, Math.round(Number(formData.get("min_tier_sort_order")) || 0));
  const oncePerMember = formData.get("once_per_member") != null;

  const startsAt = cleanDate(formData.get("starts_at"));
  const expiresAt = cleanDate(formData.get("expires_at"));
  if (startsAt && expiresAt && expiresAt < startsAt) {
    return { error: "Utløpsdatoen kan ikke være før «Gyldig fra»." };
  }

  const sb = await createClient();
  const { error } = await sb
    .from("member_campaigns")
    .update({
      name,
      description: description || null,
      discount_type: discountType,
      discount_value: value,
      min_tier_sort_order: minTier,
      starts_at: startsAt,
      expires_at: expiresAt,
      once_per_member: oncePerMember,
    })
    .eq("id", id);
  if (error) return { error: `Kunne ikke lagre kupongen: ${error.message}` };

  revalidatePath("/admin/kuponger");
  return { ok: true };
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
