"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function randomCode() {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DB-${s}`;
}

export async function createGiftCard(formData: FormData) {
  const sb = await createClient();
  const initial = Number(formData.get("initial_nok") ?? 0);
  if (!initial || initial <= 0) return;
  const code = String(formData.get("code") ?? "").trim() || randomCode();
  const expiresRaw = String(formData.get("expires_at") ?? "");
  await sb.from("gift_cards").insert({
    code,
    initial_nok: initial,
    balance_nok: initial,
    expires_at: expiresRaw || null,
  });
  revalidatePath("/admin/gavekort");
}

export async function redeemGiftCard(formData: FormData) {
  const sb = await createClient();
  const id = String(formData.get("id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  if (!id || !amount || amount <= 0) return;
  const { data } = await sb
    .from("gift_cards")
    .select("balance_nok")
    .eq("id", id)
    .single();
  if (!data) return;
  const next = Math.max(0, Number(data.balance_nok) - amount);
  await sb.from("gift_cards").update({ balance_nok: next }).eq("id", id);
  revalidatePath("/admin/gavekort");
}

export async function deleteGiftCard(id: string) {
  const sb = await createClient();
  await sb.from("gift_cards").delete().eq("id", id);
  revalidatePath("/admin/gavekort");
}
