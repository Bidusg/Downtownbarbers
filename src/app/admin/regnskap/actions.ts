"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { syncTripletexFinancials } from "@/lib/tripletex/sync";

/**
 * Kjør Tripletex-synken manuelt fra admin (knapp på /admin/regnskap). Kun admin.
 * Henter regnskapstall fra Tripletex inn i Supabase og revaliderer sidene som
 * viser dem. Synken kaster aldri selv — den returnerer et resultat-objekt der
 * `error` kun finnes på feil-varianten (SyncResult).
 */
export async function syncTripletexNow(): Promise<{
  ok: boolean;
  error: string | null;
}> {
  await requireRole(["admin"]);
  const r = await syncTripletexFinancials();
  revalidatePath("/admin/regnskap");
  revalidatePath("/revisor/saldobalanse");
  const error = "error" in r ? r.error : null;
  return { ok: !error, error: error ?? null };
}
