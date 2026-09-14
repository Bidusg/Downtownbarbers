"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { ROLES } from "@/lib/users-queries";

/**
 * Setter rolle på en bruker. Kun admin. Sperrer mot å endre egen rolle
 * (så en admin ikke kan låse seg selv ute).
 */
export async function setUserRole(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !(ROLES as readonly string[]).includes(role)) return;

  const me = await getUserRole();
  if (!me || me.role !== "admin") return;
  if (me.userId === userId) return; // ikke endre egen rolle

  const sb = await createClient();
  await sb.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/admin/brukere");
}
