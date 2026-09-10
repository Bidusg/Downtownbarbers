"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Løs inn gratisklipp for en kunde. Returnerer status fra databasen. */
export async function redeemLoyalty(customerId: string): Promise<string> {
  const sb = await createClient();
  const { data, error } = await sb.rpc("redeem_loyalty", {
    p_customer: customerId,
  });
  revalidatePath(`/kasse/kunder/${customerId}`);
  if (error) return "error";
  return (data as string) ?? "error";
}
