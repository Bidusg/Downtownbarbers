"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/**
 * KUNDEKLUBB — datadrevne nivåer. Admin kan redigere, legge til, slette og
 * omordne nivåer. Rangen (hvilket nivå som er «høyest») styres av sort_order.
 * Alle handlinger er admin-only (isAdminRole dekker admin + eier), og selve
 * skriving går enten via membership_tiers-RLS (admin_all) eller via
 * security-definer-RPC-er med egen is_admin()-vakt.
 */

async function guard(): Promise<boolean> {
  const me = await getUserRole();
  return !!me && isAdminRole(me.role);
}

/** Lagre ett eksisterende nivå (navn, terskler, gode, farge). */
export async function saveTier(formData: FormData): Promise<void> {
  if (!(await guard())) return;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  const name = String(formData.get("name") ?? "").trim();
  const benefit = String(formData.get("benefit") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const minSpend = Math.max(0, Number(formData.get("min_spend")) || 0);
  const minVisits = Math.max(0, Math.round(Number(formData.get("min_visits")) || 0));

  const sb = await createClient();
  await sb
    .from("membership_tiers")
    .update({
      name: name || "Nivå",
      min_spend: minSpend,
      min_visits: minVisits,
      benefit: benefit || null,
      color: color || null,
    })
    .eq("id", id);

  revalidatePath("/admin/kundeklubb");
}

/** Legg til et nytt nivå (blir det nye toppnivået; kan omordnes etterpå). */
export async function addTier(formData: FormData): Promise<{ ok?: true; error?: string }> {
  if (!(await guard())) return { error: "Ikke tilgang" };

  const name = String(formData.get("name") ?? "").trim();
  const benefit = String(formData.get("benefit") ?? "").trim();
  let color = String(formData.get("color") ?? "").trim();
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) color = "#" + color;
  const minSpend = Math.max(0, Number(formData.get("min_spend")) || 0);
  const minVisits = Math.max(0, Math.round(Number(formData.get("min_visits")) || 0));

  if (!name) return { error: "Nivået må ha et navn." };
  if (color && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) {
    return { error: "Fargen må være en hex-kode, f.eks. #E5E4E2." };
  }

  const sb = await createClient();
  const { error } = await sb.rpc("membership_tier_add", {
    p_name: name,
    p_min_spend: minSpend,
    p_min_visits: minVisits,
    p_benefit: benefit || null,
    p_color: color || null,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Et nivå med dette navnet finnes allerede."
        : error.message || "Kunne ikke legge til nivået.",
    };
  }

  revalidatePath("/admin/kundeklubb");
  return { ok: true };
}

/** Slett et nivå (RPC nekter om det er det siste). */
export async function deleteTier(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!(await guard())) return { ok: false, error: "Ikke tilgang" };
  if (!Number.isInteger(id)) return { ok: false, error: "Ugyldig nivå" };

  const sb = await createClient();
  const { error } = await sb.rpc("membership_tier_delete", { p_id: id });
  if (error) {
    return { ok: false, error: error.message || "Kunne ikke slette nivået" };
  }
  revalidatePath("/admin/kundeklubb");
  return { ok: true };
}

/** Flytt et nivå opp (bedre) eller ned i rangen. */
export async function moveTier(
  id: number,
  dir: "up" | "down",
): Promise<{ ok: boolean; error?: string }> {
  if (!(await guard())) return { ok: false, error: "Ikke tilgang" };
  if (!Number.isInteger(id)) return { ok: false, error: "Ugyldig nivå" };

  const sb = await createClient();
  const { error } = await sb.rpc("membership_tier_move", { p_id: id, p_dir: dir });
  if (error) return { ok: false, error: "Kunne ikke omordne" };

  revalidatePath("/admin/kundeklubb");
  return { ok: true };
}
