"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/**
 * Lagrer prismatrisen (pris per nivå × tjeneste). Felt heter
 * price_<serviceId>_<levelId>. Tomt felt = ingen nivåpris (fall tilbake til
 * basispris) → raden slettes. Kun admin/eier.
 */
export async function saveLevelPrices(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };

  const sb = await createClient();
  const upserts: {
    service_id: string;
    level_id: string;
    price_nok: number;
    updated_at: string;
  }[] = [];
  const deletes: { service_id: string; level_id: string }[] = [];
  const now = new Date().toISOString();

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("price_")) continue;
    const rest = key.slice("price_".length);
    const sep = rest.indexOf("__");
    if (sep < 0) continue;
    const service_id = rest.slice(0, sep);
    const level_id = rest.slice(sep + 2);
    const str = String(raw).trim();
    if (str === "") {
      deletes.push({ service_id, level_id });
      continue;
    }
    const n = Number(str.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) continue;
    upserts.push({ service_id, level_id, price_nok: Math.round(n), updated_at: now });
  }

  if (upserts.length > 0) {
    const { error } = await sb
      .from("service_level_prices")
      .upsert(upserts, { onConflict: "service_id,level_id" });
    if (error) return { error: error.message };
  }
  for (const d of deletes) {
    await sb
      .from("service_level_prices")
      .delete()
      .eq("service_id", d.service_id)
      .eq("level_id", d.level_id);
  }

  revalidatePath("/admin/nivaer");
  return { ok: true };
}
