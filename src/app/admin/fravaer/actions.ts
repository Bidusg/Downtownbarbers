"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createAbsence(formData: FormData) {
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const from_date = String(formData.get("from_date") ?? "");
  const to_date = String(formData.get("to_date") ?? "");
  if (!staff_id || !from_date || !to_date) return;
  await sb.from("absences").insert({
    staff_id,
    from_date,
    to_date,
    reason: String(formData.get("reason") ?? "") || null,
  });
  revalidatePath("/admin/fravaer");
}

export async function deleteAbsence(id: string) {
  const sb = await createClient();
  await sb.from("absences").delete().eq("id", id);
  revalidatePath("/admin/fravaer");
}

export type DecideResult = { ok: true } | { ok: false; error: string };

/** Admin godkjenner/avslår en fravaerssøknad. status + fravær håndteres
 *  server-side i decide_leave_request (SECURITY DEFINER, is_admin-gatet). */
export async function decideLeaveRequest(
  id: string,
  approve: boolean,
): Promise<DecideResult> {
  try {
    await requireRole(["admin"]);
    const sb = await createClient();
    const { error } = await sb.rpc("decide_leave_request", {
      p_id: id,
      p_approve: approve,
    });
    if (error) {
      return { ok: false, error: error.message || "Kunne ikke behandle søknaden." };
    }
    revalidatePath("/admin/fravaer");
    return { ok: true };
  } catch {
    return { ok: false, error: "Noe gikk galt." };
  }
}
