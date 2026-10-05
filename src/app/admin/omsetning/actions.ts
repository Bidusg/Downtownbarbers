"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/**
 * Annullerer et salg via RPC `void_sale` (KJØR-I-SUPABASE-BYGG9.sql):
 * salget slettes fra omsetningen, lager/gavekort tilbakeføres, bookingen
 * settes tilbake til «bekreftet», og en kopi logges i sale_voids.
 * Nektes av databasen hvis dagen allerede er sendt til Tripletex.
 */
export async function voidSale(
  saleId: string,
  reason: string,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin/eier kan annullere salg." };
  const sb = await createClient();
  const { error } = await sb.rpc("void_sale", {
    p_sale: saleId,
    p_reason: reason.trim() || null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Tripletex")) return { error: msg.replace(/^.*?: /, "") };
    if (msg.includes("void_sale")) return { error: "Databasen mangler void_sale – kjør KJØR-I-SUPABASE-BYGG9.sql." };
    return { error: "Kunne ikke annullere salget: " + msg };
  }
  revalidatePath("/admin/omsetning");
  revalidatePath("/admin/regnskap");
  revalidatePath("/admin");
  revalidatePath("/kasse");
  return { ok: true };
}
