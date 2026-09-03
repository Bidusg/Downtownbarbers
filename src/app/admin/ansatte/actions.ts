"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "staff-files";

async function uploadFile(
  sb: Awaited<ReturnType<typeof createClient>>,
  file: File | null,
  prefix: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) return null;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createStaff(formData: FormData) {
  const sb = await createClient();

  const photo_url = await uploadFile(
    sb,
    formData.get("photo") as File | null,
    "photos",
  );
  const contract_url = await uploadFile(
    sb,
    formData.get("contract") as File | null,
    "contracts",
  );

  await sb.from("staff").insert({
    employee_number: String(formData.get("employee_number") ?? "") || null,
    full_name: String(formData.get("full_name") ?? ""),
    title: String(formData.get("title") ?? "") || null,
    bio: String(formData.get("bio") ?? "") || null,
    photo_url,
    contract_url,
    active: true,
  });
  revalidatePath("/admin/ansatte");
}

export async function toggleStaff(id: string, active: boolean) {
  const sb = await createClient();
  await sb.from("staff").update({ active }).eq("id", id);
  revalidatePath("/admin/ansatte");
}

/** Setter 4-sifret stemplings-PIN for en ansatt (via sikker RPC). */
export async function setStaffPin(
  id: string,
  pin: string,
): Promise<{ ok?: true; error?: string }> {
  if (!/^\d{4}$/.test(pin)) return { error: "PIN må være 4 siffer." };
  const sb = await createClient();
  const { error } = await sb.rpc("set_staff_pin", { p_staff: id, p_pin: pin });
  if (error) return { error: "Kunne ikke lagre PIN." };
  revalidatePath("/admin/ansatte");
  return { ok: true };
}
