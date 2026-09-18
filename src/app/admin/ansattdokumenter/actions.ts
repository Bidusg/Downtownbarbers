"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole, getUserRole } from "@/lib/auth";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-documents";

const PUBLIC_BUCKET = "staff-files";

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

export type ContractMigrationState = {
  ok: boolean;
  moved: number;
  skipped: number;
  errors: string[];
} | null;

/**
 * Engangs sikkerhetsopprydding: flytt gamle kontrakter fra den OFFENTLIGE
 * `staff-files`-bøtta (som tillater offentlig lesing/listing) til den private
 * `staff-docs`-bøtta, og registrer dem i staff_documents (kategori 'kontrakt').
 *
 * For hver ansatt med `contract_url` som peker på staff-files:
 *   1) last ned fila, 2) last opp privat, 3) skriv staff_documents-rad,
 *   4) nullstill staff.contract_url, 5) slett den offentlige originalen.
 * Sletting skjer KUN etter at kopi + rad er bekreftet — ingen datatap ved feil.
 * Idempotent: når contract_url er nullet, plukkes ansatt ikke opp igjen.
 *
 * Bruker service-role (server-til-server): staff-files har ingen delete-policy,
 * og dette er en admin-utløst engangsjobb.
 */
export async function migrateContractsToPrivate(
  _prev: ContractMigrationState,
  _formData: FormData,
): Promise<ContractMigrationState> {
  void _prev;
  void _formData;
  await requireRole(["admin"]);
  const me = await getUserRole();
  if (!me) return { ok: false, moved: 0, skipped: 0, errors: ["Ikke innlogget."] };

  const svc = createServiceClient();
  const marker = `/${PUBLIC_BUCKET}/`;

  const { data: staff, error } = await svc
    .from("staff")
    .select("id, full_name, contract_url")
    .not("contract_url", "is", null);
  if (error) {
    return { ok: false, moved: 0, skipped: 0, errors: [error.message] };
  }

  let moved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const s of (staff ?? []) as { id: string; full_name: string; contract_url: string }[]) {
    const url = s.contract_url ?? "";
    const idx = url.indexOf(marker);
    if (idx === -1) {
      skipped++; // peker ikke på den offentlige bøtta – la stå
      continue;
    }
    let objectPath = url.slice(idx + marker.length).split("?")[0];
    try {
      objectPath = decodeURIComponent(objectPath);
    } catch {
      /* behold rå sti */
    }

    // 1) Last ned fra offentlig bøtte.
    const { data: blob, error: dlErr } = await svc.storage
      .from(PUBLIC_BUCKET)
      .download(objectPath);
    if (dlErr || !blob) {
      errors.push(`${s.full_name}: kunne ikke laste ned (${dlErr?.message ?? "tom fil"})`);
      continue;
    }

    // 2) Last opp privat.
    const ext = (objectPath.split(".").pop() || "pdf").toLowerCase().slice(0, 12);
    const newPath = `${s.id}/${crypto.randomUUID()}-kontrakt.${ext}`;
    const { error: upErr } = await svc.storage
      .from(STAFF_DOCS_BUCKET)
      .upload(newPath, blob, {
        upsert: false,
        contentType: blob.type || "application/octet-stream",
      });
    if (upErr) {
      errors.push(`${s.full_name}: opplasting til privat feilet (${upErr.message})`);
      continue;
    }

    // 3) Registrer i staff_documents.
    const { error: dbErr } = await svc.from("staff_documents").insert({
      staff_id: s.id,
      category: "kontrakt",
      name: "Kontrakt (migrert)",
      path: newPath,
      size_bytes: blob.size,
      mime: blob.type || null,
      uploaded_by: me.userId,
      by_staff: false,
    });
    if (dbErr) {
      await svc.storage.from(STAFF_DOCS_BUCKET).remove([newPath]);
      errors.push(`${s.full_name}: kunne ikke lagre metadata (${dbErr.message})`);
      continue;
    }

    // 4) Nullstill den offentlige URL-en.
    await svc.from("staff").update({ contract_url: null }).eq("id", s.id);

    // 5) Slett den offentlige originalen (først nå — kopi er bekreftet).
    await svc.storage.from(PUBLIC_BUCKET).remove([objectPath]);

    moved++;
  }

  revalidatePath("/admin/ansattdokumenter");
  revalidatePath("/admin/ansatte");
  return { ok: true, moved, skipped, errors };
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
