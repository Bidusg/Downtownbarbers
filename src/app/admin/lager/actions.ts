"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StockResult = { ok?: true; error?: string };

const REASONS = ["varemottak", "svinn", "telling", "justering"];

function rpcError(message: string): string {
  if (message.includes("tilgang")) return "Ingen tilgang til lagerjustering.";
  if (/negativ|negative|under 0|check/i.test(message)) return "Lageret kan ikke bli negativt.";
  return "Kunne ikke lagre justeringen: " + message;
}

function refresh() {
  revalidatePath("/admin/lager");
  revalidatePath("/admin/produkter");
  revalidatePath("/admin/rapporter");
}

/** Juster lager (delta kan være negativt). reason: varemottak | svinn | telling | justering. */
export async function adjustStockAction(formData: FormData): Promise<StockResult> {
  const productId = String(formData.get("productId") ?? "");
  const rawDelta = Number(formData.get("delta") ?? 0);
  const rawReason = String(formData.get("reason") ?? "justering");
  const reason = REASONS.includes(rawReason) ? rawReason : "justering";
  const note = String(formData.get("note") ?? "");
  if (!productId) return { error: "Velg et produkt." };
  if (!Number.isInteger(rawDelta) || rawDelta === 0)
    return { error: "Antall må være et helt tall (ikke 0)." };
  const sb = await createClient();
  const { error } = await sb.rpc("record_stock_movement", {
    p_product: productId,
    p_delta: rawDelta,
    p_reason: reason,
    p_note: note,
  });
  if (error) return { error: rpcError(error.message) };
  refresh();
  return { ok: true };
}

/**
 * Lager-justering fra skanning (admin + shop). Returnerer ny beholdning for
 * pen tilbakemelding. delta > 0 = inn, < 0 = ut.
 */
export async function scanAdjustStock(
  productId: string,
  delta: number,
  reason: string,
): Promise<{ ok?: true; newStock?: number; error?: string }> {
  if (!productId || !Number.isInteger(delta) || delta === 0)
    return { error: "Ugyldig antall." };
  const sb = await createClient();
  const { data, error } = await sb.rpc("record_stock_movement", {
    p_product: productId,
    p_delta: delta,
    p_reason: reason || "justering",
    p_note: "Skann",
  });
  if (error) {
    return {
      error: error.message.includes("tilgang")
        ? "Ingen tilgang til lagerjustering."
        : "Kunne ikke lagre justeringen.",
    };
  }
  refresh();
  revalidatePath("/kasse/lager");
  return { ok: true, newStock: Number(data) || 0 };
}

/** Sett lager til et absolutt tall (regner ut differansen og logger den). */
export async function setStockAction(formData: FormData): Promise<StockResult> {
  const productId = String(formData.get("productId") ?? "");
  const rawTarget = String(formData.get("target") ?? "").trim();
  const target = Number(rawTarget);
  if (!productId) return { error: "Mangler produkt." };
  if (rawTarget === "" || !Number.isInteger(target) || target < 0)
    return { error: "Skriv et helt tall, 0 eller mer." };
  const sb = await createClient();
  const { data: p, error: readErr } = await sb
    .from("products")
    .select("stock")
    .eq("id", productId)
    .maybeSingle();
  if (readErr || !p) return { error: "Fant ikke produktet." };
  const current = Number(p.stock) || 0;
  const delta = target - current;
  if (delta === 0) return { ok: true };
  const { error } = await sb.rpc("record_stock_movement", {
    p_product: productId,
    p_delta: delta,
    p_reason: "telling",
    p_note: "Satt til " + target,
  });
  if (error) return { error: rpcError(error.message) };
  refresh();
  return { ok: true };
}

/** Oppdater lav-lager-terskel for et produkt. */
export async function setThresholdAction(formData: FormData): Promise<StockResult> {
  const productId = String(formData.get("productId") ?? "");
  const threshold = Number(formData.get("threshold") ?? 0);
  if (!productId) return { error: "Mangler produkt." };
  if (!Number.isInteger(threshold) || threshold < 0)
    return { error: "Terskel må være et helt tall, 0 eller mer." };
  const sb = await createClient();
  const { error } = await sb
    .from("products")
    .update({ low_stock_threshold: threshold })
    .eq("id", productId);
  if (error) return { error: "Kunne ikke lagre terskel: " + error.message };
  refresh();
  return { ok: true };
}
