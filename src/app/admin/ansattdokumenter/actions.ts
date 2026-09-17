"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, getUserRole } from "@/lib/auth";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-documents";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ADMIN_CATEGORIES = ["kontrakt", "annet"] as const;
type AdminCategory = (typeof ADMIN_CATEGORIES)[number];

/** Enkel, trygg slug for filnavn (beholder bokstaver/tall/bindestrek + ev. filtype). */
function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const clean = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const b = clean(base).slice(0, 80) || "fil";
  const e = clean(ext).slice(0, 12);
  return e ? `${b}.${e}` : b;
}

/**
 * Admin laster opp et dokument (kontrakt eller annet – ALDRI lønnslipp) for én
 * ansatt. Kjører server-side med innlogget admin-sesjon, så RLS (is_admin())
 * passerer på både storage-objektet og staff_documents-raden.
 */
export async function uploadStaffDocument(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const me = await getUserRole();
  if (!me) return { error: "Ikke innlogget." };

  const staff_id = String(formData.get("staff_id") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!staff_id) return { error: "Mangler ansatt." };
  if (!ADMIN_CATEGORIES.includes(category as AdminCategory)) {
    return { error: "Ugyldig kategori. Velg kontrakt eller annet." };
  }
  if (!file || file.size === 0) return { error: "Du må velge en fil." };
  if (file.size > MAX_BYTES) return { error: "Filen er for stor (maks 4 MB)." };

  const path = `${staff_id}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const sb = await createClient();
  const { error: storageError } = await sb.storage
    .from(STAFF_DOCS_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
  if (storageError) {
    console.error("uploadStaffDocument (storage) failed:", storageError);
    return { error: "Opplastingen feilet. Prøv igjen." };
  }

  const { error: dbError } = await sb.from("staff_documents").insert({
    staff_id,
    category,
    name: file.name,
    path,
    size_bytes: file.size,
    mime: file.type || null,
    uploaded_by: me.userId,
    by_staff: false,
  });
  if (dbError) {
    // Rydd opp storage-objektet hvis metadata-raden feiler.
    await sb.storage.from(STAFF_DOCS_BUCKET).remove([path]);
    console.error("uploadStaffDocument (db) failed:", dbError);
    return { error: "Kunne ikke lagre dokumentet. Prøv igjen." };
  }

  revalidatePath("/admin/ansattdokumenter");
  return { ok: true };
}

/** Sletter både storage-objektet og metadata-raden. Admin kan slette alt (inkl. lønnslipp). */
export async function deleteStaffDocument(id: string): Promise<void> {
  await requireRole(["admin"]);

  const sb = await createClient();
  const { data: doc } = await sb
    .from("staff_documents")
    .select("path")
    .eq("id", id)
    .maybeSingle();

  if (doc?.path) {
    await sb.storage.from(STAFF_DOCS_BUCKET).remove([doc.path as string]);
  }
  await sb.from("staff_documents").delete().eq("id", id);

  revalidatePath("/admin/ansattdokumenter");
}
