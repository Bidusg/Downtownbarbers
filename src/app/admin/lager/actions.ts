"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/admin/lager");
  revalidatePath("/admin/produkter");
  revalidatePath("/admin/rapporter");
}

/** Juster lager (delta kan være negativt). reason: varemottak | svinn | telling | justering. */
export async function adjustStockAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const delta = Math.trunc(Number(formData.get("delta") ?? 0));
  const reason = String(formData.get("reason") ?? "justering");
  const note = String(formData.get("note") ?? "");
  if (!productId || !Number.isFinite(delta) || delta === 0) return;
  const sb = await createClient();
  await sb.rpc("record_stock_movement", {
    p_product: productId,
    p_delta: delta,
    p_reason: reason,
    p_note: note,
  });
  refresh();
}

/** Sett lager til et absolutt tall (regner ut differansen og logger den). */
export async function setStockAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const target = Math.trunc(Number(formData.get("target") ?? 0));
  if (!productId || !Number.isFinite(target) || target < 0) return;
  const sb = await createClient();
  const { data: p } = await sb
    .from("products")
    .select("stock")
    .eq("id", productId)
    .maybeSingle();
  const current = Number(p?.stock) || 0;
  const delta = target - current;
  if (delta === 0) return;
  await sb.rpc("record_stock_movement", {
    p_product: productId,
    p_delta: delta,
    p_reason: "telling",
    p_note: "Satt til " + target,
  });
  refresh();
}

/** Oppdater lav-lager-terskel for et produkt. */
export async function setThresholdAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const threshold = Math.max(0, Math.trunc(Number(formData.get("threshold") ?? 0)));
  if (!productId || !Number.isFinite(threshold)) return;
  const sb = await createClient();
  await sb.from("products").update({ low_stock_threshold: threshold }).eq("id", productId);
  refresh();
}
