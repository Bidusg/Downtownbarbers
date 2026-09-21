"use server";

import { revalidatePath } from "next/cache";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { saveShopFlags, type ShopFlags } from "@/lib/shop-settings";

/**
 * Lagrer shop-flags fra admin-panelet. Kun admin/eier (RPC-en set_shop_flags
 * håndhever også dette server-side). Avkrysningsbokser som ikke er huket av
 * kommer ikke med i FormData, derfor leser vi dem eksplisitt som on/undefined.
 */
export async function saveShopSettings(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };

  const on = (k: string) => formData.get(k) === "on";
  const pctRaw = Number(formData.get("friend_family_discount_pct"));
  const pct =
    Number.isFinite(pctRaw) && pctRaw >= 0 && pctRaw <= 100
      ? Math.round(pctRaw)
      : 20;

  const patch: ShopFlags = {
    discount_enabled: on("discount_enabled"),
    friend_family_discount_enabled: on("friend_family_discount_enabled"),
    friend_family_discount_pct: pct,
    dropin_without_customer_enabled: on("dropin_without_customer_enabled"),
    drag_for_length_enabled: on("drag_for_length_enabled"),
  };

  const r = await saveShopFlags(patch);
  if (r.error) return { error: r.error };
  revalidatePath("/admin/shop-innstillinger");
  revalidatePath("/kasse");
  return { ok: true };
}
