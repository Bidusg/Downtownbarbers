"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

const BUCKET = "vouchers";

type ActionResult = { ok?: true; error?: string };

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

/** Parser et beløp-felt («1 234,50» / «1234.50») til number, ellers null. */
function parseAmount(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const KINDS = ["faktura", "kvittering", "bilag", "annet"] as const;
type Kind = (typeof KINDS)[number];

/**
 * Laster opp et bilag til den PRIVATE bøtta 'vouchers' og lagrer metadata.
 * Kun admin. Opplasting skjer server-side med innlogget admin-sesjon, så
 * RLS-policyene (is_admin()) passerer. Bilaget dukker automatisk opp hos
 * revisor.
 */
export async function uploadVoucher(formData: FormData): Promise<ActionResult> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) {
    return { error: "Ingen tilgang." };
  }

  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const voucherDate = String(formData.get("voucher_date") ?? "").trim();
  const amountNok = parseAmount(formData.get("amount_nok"));
  const vatNok = parseAmount(formData.get("vat_nok"));

  if (!file || file.size === 0) {
    return { error: "Du må velge en fil." };
  }

  const kind: Kind = (KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as Kind)
    : "bilag";
  const displayTitle = title || file.name;
  const path = `${crypto.randomUUID()}-${slug(file.name)}`;

  const sb = await createClient();
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    console.error("uploadVoucher (storage) failed:", error);
    return { error: "Opplastingen feilet. Sjekk filstørrelse og prøv igjen." };
  }

  const { error: dbError } = await sb.from("vouchers").insert({
    title: displayTitle,
    supplier: supplier || null,
    voucher_date: voucherDate || null,
    kind,
    amount_nok: amountNok,
    vat_nok: vatNok,
    path,
    size_bytes: file.size,
    mime: file.type || null,
    uploaded_by: me.userId,
  });
  if (dbError) {
    // Rydd opp Storage-objektet hvis metadata-raden feiler.
    await sb.storage.from(BUCKET).remove([path]);
    console.error("uploadVoucher (db) failed:", dbError);
    return { error: "Kunne ikke lagre bilaget. Prøv igjen." };
  }

  revalidatePath("/admin/bilag");
  return { ok: true };
}

/** Sletter både Storage-objektet og metadata-raden. Kun admin. */
export async function deleteVoucher(id: string): Promise<ActionResult> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) {
    return { error: "Ingen tilgang." };
  }

  const sb = await createClient();
  const { data: row } = await sb
    .from("vouchers")
    .select("path")
    .eq("id", id)
    .maybeSingle();

  if (row?.path) {
    await sb.storage.from(BUCKET).remove([row.path as string]);
  }
  const { error } = await sb.from("vouchers").delete().eq("id", id);
  if (error) {
    console.error("deleteVoucher failed:", error);
    return { error: "Kunne ikke slette bilaget. Prøv igjen." };
  }

  revalidatePath("/admin/bilag");
  return { ok: true };
}

/**
 * Returnerer en tidsbegrenset (60 s) signert URL for nedlasting fra den
 * private bøtta. Tilgang: admin/eier ELLER revisor (revisor er lese-kun).
 * Null ved feil eller manglende tilgang.
 */
export async function voucherSignedUrl(id: string): Promise<string | null> {
  const me = await getUserRole();
  const allowed =
    !!me && (isAdminRole(me.role) || me.role === "revisor");
  if (!allowed) return null;

  const sb = await createClient();
  const { data: row } = await sb
    .from("vouchers")
    .select("path")
    .eq("id", id)
    .maybeSingle();
  if (!row?.path) return null;

  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(row.path as string, 60, { download: true });
  if (error || !data?.signedUrl) {
    console.error("voucherSignedUrl failed:", error);
    return null;
  }
  return data.signedUrl;
}
