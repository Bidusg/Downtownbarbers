"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

/** Marker en henvendelse som behandlet (eller ny igjen). Kun admin. */
export async function setContactStatus(id: string, status: "ny" | "behandlet"): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  const sb = await createClient();
  const { error } = await sb
    .from("contact_messages")
    .update({
      status,
      handled_at: status === "behandlet" ? new Date().toISOString() : null,
      handled_by: status === "behandlet" ? me.userId : null,
    })
    .eq("id", id);
  if (error) return { error: "Kunne ikke lagre." };
  revalidatePath("/admin/henvendelser");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
