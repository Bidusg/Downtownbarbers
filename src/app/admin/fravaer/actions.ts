"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createAbsence(formData: FormData) {
  await requireRole(["admin"]);
  const sb = await createClient();
  const staff_id = String(formData.get("staff_id") ?? "");
  const from_date = String(formData.get("from_date") ?? "");
  const to_date = String(formData.get("to_date") ?? "");
  if (!staff_id || !from_date || !to_date) return;
  const rawKind = String(formData.get("kind") ?? "annet");
  const kind = KINDS.includes(rawKind) ? rawKind : "annet";
  const row = {
    staff_id,
    from_date,
    to_date,
    reason: String(formData.get("reason") ?? "") || null,
  };
  const { error } = await sb.from("absences").insert({ ...row, kind });
  // Før FRAVAER-LONN-SQL er kjørt finnes ikke kind – lagre uten type.
  if (error && /kind/.test(error.message)) await sb.from("absences").insert(row);
  revalidatePath("/admin/fravaer");
  revalidatePath("/admin/lonn");
}

const KINDS = ["ulonnet", "ugyldig", "syk", "ferie", "annet"];

/** Endre fraværstype (påvirker trekk i lønn). */
export async function updateAbsenceKind(id: string, kind: string): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  if (!KINDS.includes(kind)) return { error: "Ugyldig type." };
  const sb = await createClient();
  const { error } = await sb.from("absences").update({ kind }).eq("id", id);
  if (error) return { error: /kind/.test(error.message) ? "Kjør KJØR-I-SUPABASE-FRAVAER-LONN.sql først." : error.message };
  revalidatePath("/admin/fravaer");
  revalidatePath("/admin/lonn");
  return { ok: true };
}

export async function deleteAbsence(id: string) {
  await requireRole(["admin"]);
  const sb = await createClient();
  await sb.from("absences").delete().eq("id", id);
  revalidatePath("/admin/fravaer");
  revalidatePath("/admin/lonn");
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


/** Rediger et registrert fravær (datoer, type, kommentar). Lønn regnes om. */
export async function updateAbsence(
  id: string,
  input: { from_date: string; to_date: string; kind: string; reason: string },
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(input.from_date) || !isDate(input.to_date)) return { error: "Velg gyldige datoer." };
  if (input.to_date < input.from_date) return { error: "Til-dato kan ikke være før fra-dato." };
  if (!KINDS.includes(input.kind)) return { error: "Velg type." };
  const sb = await createClient();
  const { error } = await sb
    .from("absences")
    .update({
      from_date: input.from_date,
      to_date: input.to_date,
      kind: input.kind,
      reason: input.reason.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: /kind/.test(error.message) ? "Kjør KJØR-I-SUPABASE-FRAVAER-LONN.sql først." : error.message };
  revalidatePath("/admin/fravaer");
  revalidatePath("/admin/lonn");
  revalidatePath("/admin/bookinger");
  revalidatePath("/booking");
  return { ok: true };
}
