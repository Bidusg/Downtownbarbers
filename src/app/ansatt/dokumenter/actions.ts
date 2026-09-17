"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getMyStaffLink } from "@/lib/ansatt-queries";
import { createClient } from "@/lib/supabase/server";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-documents";

export type DocResult = { ok: true } | { ok: false; error: string };

// Server actions body-grense er satt til 4mb i next.config – hold oss trygt under.
const MAX_BYTES = 4 * 1024 * 1024;

/** Rens filnavn til noe trygt for et storage-path (behold ext, unngå rare tegn). */
function safeName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || "fil";
}

/** Ansatt laster opp et eget «annet»-dokument til EGEN mappe.
 *  staff_id utledes server-side via getMyStaffLink() – aldri fra klient.
 *  RLS krever i tillegg by_staff=true og category='annet' for self_insert. */
export async function uploadMyDocument(fd: FormData): Promise<DocResult> {
  try {
    await requireRole(["staff", "admin"]);

    const link = await getMyStaffLink();
    if (!link.linked || !link.staffId) {
      return {
        ok: false,
        error: "Kontoen din er ikke koblet til en ansattprofil.",
      };
    }
    const staffId = link.staffId;

    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Velg en fil å laste opp." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "Filen er for stor (maks 4 MB)." };
    }

    const path = `${staffId}/${crypto.randomUUID()}-${safeName(file.name)}`;

    const sb = await createClient();
    const { error: upErr } = await sb.storage
      .from(STAFF_DOCS_BUCKET)
      .upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      return { ok: false, error: upErr.message || "Opplasting feilet." };
    }

    const { error: insErr } = await sb.from("staff_documents").insert({
      staff_id: staffId,
      category: "annet",
      name: file.name,
      path,
      size_bytes: file.size,
      mime: file.type || null,
      by_staff: true,
    });
    if (insErr) {
      // Rydd opp det vi rakk å laste opp så vi ikke etterlater foreldreløse objekter.
      await sb.storage.from(STAFF_DOCS_BUCKET).remove([path]);
      return {
        ok: false,
        error: insErr.message || "Kunne ikke lagre dokumentet.",
      };
    }

    revalidatePath("/ansatt/dokumenter");
    return { ok: true };
  } catch {
    return { ok: false, error: "Noe gikk galt." };
  }
}

/** Ansatt sletter sitt EGET opplastede (by_staff) «annet»-dokument.
 *  Eierskap håndheves av RLS (self_delete krever by_staff=true), men vi
 *  slår likevel opp raden for å hente path og verifisere før sletting. */
export async function deleteMyDocument(id: string): Promise<DocResult> {
  try {
    await requireRole(["staff", "admin"]);
    if (!id) return { ok: false, error: "Mangler dokument-id." };

    const sb = await createClient();

    // RLS begrenser select til egne rader; vi krever i tillegg by_staff + annet.
    const { data: row } = await sb
      .from("staff_documents")
      .select("id, path, by_staff, category")
      .eq("id", id)
      .maybeSingle();

    if (!row || !row.by_staff || row.category !== "annet") {
      return { ok: false, error: "Dette dokumentet kan ikke slettes." };
    }

    const { error: rmErr } = await sb.storage
      .from(STAFF_DOCS_BUCKET)
      .remove([row.path as string]);
    if (rmErr) {
      return { ok: false, error: rmErr.message || "Kunne ikke slette filen." };
    }

    const { error: delErr } = await sb
      .from("staff_documents")
      .delete()
      .eq("id", id);
    if (delErr) {
      return { ok: false, error: delErr.message || "Kunne ikke slette raden." };
    }

    revalidatePath("/ansatt/dokumenter");
    return { ok: true };
  } catch {
    return { ok: false, error: "Noe gikk galt." };
  }
}
