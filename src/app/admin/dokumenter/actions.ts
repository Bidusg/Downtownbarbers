"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

const BUCKET = "documents";

/** Enkel, trygg slug for filnavn (beholder bokstaver/tall/bindestrek). */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "fil"
  );
}

/**
 * Laster opp et dokument til den PRIVATE bøtta 'documents' og lagrer metadata.
 * Kun admin. Opplasting skjer server-side med innlogget admin-sesjon, så
 * RLS-policyene (is_admin()) passerer.
 */
export async function uploadDocument(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;

  const file = formData.get("file") as File | null;
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!file || file.size === 0) redirect("/admin/dokumenter?feil=tomt");

  const displayName = name || file.name;
  const path = `${crypto.randomUUID()}-${slug(file.name)}`;

  const sb = await createClient();
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    console.error("uploadDocument (storage) failed:", error);
    redirect("/admin/dokumenter?feil=opplasting");
  }

  const { error: dbError } = await sb.from("documents").insert({
    name: displayName,
    path,
    category: category || null,
    size_bytes: file.size,
    mime: file.type || null,
    uploaded_by: me.userId,
  });
  if (dbError) {
    // Rydd opp Storage-objektet hvis metadata-raden feiler.
    await sb.storage.from(BUCKET).remove([path]);
    console.error("uploadDocument (db) failed:", dbError);
    redirect("/admin/dokumenter?feil=opplasting");
  }

  revalidatePath("/admin/dokumenter");
  redirect("/admin/dokumenter?lastet=1");
}

/** Sletter både Storage-objektet og metadata-raden. Kun admin. */
export async function deleteDocument(id: string): Promise<void> {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;

  const sb = await createClient();
  const { data: doc } = await sb
    .from("documents")
    .select("path")
    .eq("id", id)
    .maybeSingle();

  if (doc?.path) {
    await sb.storage.from(BUCKET).remove([doc.path as string]);
  }
  await sb.from("documents").delete().eq("id", id);

  revalidatePath("/admin/dokumenter");
}

/**
 * Returnerer en tidsbegrenset (60 s) signert URL for nedlasting fra den
 * private bøtta. Kun admin. Null ved feil.
 */
export async function getSignedUrl(
  path: string,
  downloadName?: string,
): Promise<string | null> {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return null;

  const sb = await createClient();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, 60, { download: downloadName ?? true });
  if (error || !data?.signedUrl) {
    console.error("getSignedUrl failed:", error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Nedlastingsmekanisme brukt av knappen i lista: lager en signert URL og
 * redirecter nettleseren dit (bøtta er privat, så direkte URL funker ikke).
 */
export async function downloadDocument(formData: FormData): Promise<void> {
  const path = String(formData.get("path") ?? "");
  const name = String(formData.get("name") ?? "") || undefined;
  if (!path) redirect("/admin/dokumenter");
  const url = await getSignedUrl(path, name);
  redirect(url ?? "/admin/dokumenter?feil=nedlasting");
}
