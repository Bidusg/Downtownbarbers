"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getShopFlags, type ShopFlags } from "@/lib/shop-settings";

/** Oppdater shop-flagg (admin). Slår sammen med eksisterende verdier. */
export async function updateShopFlags(
  patch: Partial<ShopFlags>,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  try {
    const current = await getShopFlags();
    const next: ShopFlags = { ...current, ...patch };
    // Klem satsen til 0–100.
    next.familyFriendDiscountPct = Math.max(
      0,
      Math.min(100, Math.round(Number(next.familyFriendDiscountPct) || 0)),
    );
    const sb = await createClient();
    const { error } = await sb
      .from("settings")
      .upsert({ key: "shop_flags", value: next }, { onConflict: "key" });
    if (error) return { error: error.message };
    revalidatePath("/admin/innstillinger");
    return { ok: true };
  } catch {
    return { error: "Kunne ikke lagre innstillingen. Prøv igjen." };
  }
}

/** Sett/fjern eier-status på en bruker (admin). Eier omgår shop-begrensninger. */
export async function setUserOwner(
  profileId: string,
  isOwner: boolean,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  try {
    const sb = await createClient();
    const { error } = await sb
      .from("profiles")
      .update({ is_owner: isOwner })
      .eq("id", profileId);
    if (error) return { error: error.message };
    revalidatePath("/admin/innstillinger");
    return { ok: true };
  } catch {
    return { error: "Kunne ikke oppdatere eier-status. Prøv igjen." };
  }
}
