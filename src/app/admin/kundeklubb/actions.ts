"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/**
 * Lagre ett medlemsnivå (terskler, navn, gode, farge). Kun admin.
 * Nivå-id-ene er faste (1/2/3) — her justeres bare innholdet.
 */
export async function saveTier(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

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
