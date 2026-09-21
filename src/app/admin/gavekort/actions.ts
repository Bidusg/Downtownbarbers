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
    barcode: String(formData.get("barcode") ?? "").trim() || null,
    expires_at: expiresRaw || null,
  });
  revalidatePath("/admin/gavekort");
}

/** Sett/endre strekkode på et gavekort (tom = fjern). */
export async function setGiftCardBarcode(
  id: string,
  barcode: string,
): Promise<{ ok?: true; error?: string }> {
  const sb = await createClient();
  const { error } = await sb
    .from("gift_cards")
    .update({ barcode: barcode.trim() || null })
    .eq("id", id);
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Strekkoden er allerede i bruk på et annet gavekort."
        : `Kunne ikke lagre: ${error.message}`,
    };
  }
  revalidatePath("/admin/gavekort");
  return { ok: true };
}

export type GiftCardHit = {
  id: string;
  code: string;
  balanceNok: number;
  expiresAt: string | null;
  expired: boolean;
};

/** Slå opp gavekort på kode eller strekkode (via RPC – funker for shop + admin). */
export async function findGiftCard(code: string): Promise<GiftCardHit | null> {
  const c = code.trim();
  if (!c) return null;
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("find_gift_card", { p_code: c });
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          id: string;
          code: string;
          balance_nok: number;
          expires_at: string | null;
          expired: boolean;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      balanceNok: Number(row.balance_nok) || 0,
      expiresAt: row.expires_at ?? null,
      expired: !!row.expired,
    };
  } catch {
    return null;
  }
}

/** Innløs et beløp fra gavekort (atomisk via RPC). Trekker inntil saldo. */
export async function redeemGiftCardByCode(
  code: string,
  amount: number,
): Promise<{ ok?: true; redeemed?: number; newBalance?: number; error?: string }> {
  const c = code.trim();
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (!c || amt <= 0) return { error: "Ugyldig beløp." };
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("redeem_gift_card_by_code", {
      p_code: c,
      p_amount: amt,
    });
    if (error) {
      const m = error.message;
      return {
        error: m.includes("utløpt")
          ? "Gavekortet er utløpt."
          : m.includes("tomt")
            ? "Gavekortet er tomt."
            : m.includes("Fant ikke")
              ? "Fant ikke gavekortet."
              : m.includes("tilgang")
                ? "Ingen tilgang."
                : "Kunne ikke innløse.",
      };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { redeemed: number; new_balance: number }
      | undefined;
    revalidatePath("/admin/gavekort");
    return {
      ok: true,
      redeemed: Number(row?.redeemed) || 0,
      newBalance: Number(row?.new_balance) || 0,
    };
  } catch {
    return { error: "Kunne ikke innløse." };
  }
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
