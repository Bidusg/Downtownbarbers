"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, requireRole } from "@/lib/auth";

/** Oppdater status på en krisetime-forespørsel (kasse/admin). */
export async function setCrisisStatus(
  id: string,
  status: "ny" | "ringt" | "booket" | "avvist",
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  const me = await getUserRole();
  const sb = await createClient();
  const done = status === "booket" || status === "avvist";
  const { error } = await sb
    .from("crisis_requests")
    .update({
      status,
      handled_at: done ? new Date().toISOString() : null,
      handled_by: done ? (me?.userId ?? null) : null,
    })
    .eq("id", id);
  if (error) return { error: "Kunne ikke lagre." };
  revalidatePath("/kasse/krisetimer");
  revalidatePath("/kasse", "layout");
  return { ok: true };
}
