"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";

async function guard(): Promise<boolean> {
  const me = await getUserRole();
  return !!me && isAdminRole(me.role);
}

const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const pct = (v: FormDataEntryValue | null) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

function fields(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim(),
    label: String(fd.get("label") ?? "").trim(),
    headline: text(fd.get("headline")),
    body: text(fd.get("body")),
    service_pct: pct(fd.get("service_pct")),
    friend_pct: pct(fd.get("friend_pct")),
    product_pct: pct(fd.get("product_pct")),
    book_by: date(fd.get("book_by")),
    visit_by: date(fd.get("visit_by")),
    products_until: date(fd.get("products_until")),
    once_per_customer: fd.get("once_per_customer") != null,
  };
}

/** Kort, uforutsigbar kode: «kpmg-x7k2». */
function makeSlug(name: string): string {
  const head =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")[0]
      ?.slice(0, 12) || "tilbud";
  const tail = randomBytes(3).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 4);
  return `${head}-${tail}`;
}

export async function savePromo(fd: FormData): Promise<{ ok?: true; error?: string }> {
  if (!(await guard())) return { error: "Ikke tilgang" };
  const f = fields(fd);
  if (!f.name) return { error: "Gi tilbudet et navn." };
  if (!f.label) return { error: "Skriv hva kunden skal se (f.eks. «KPMG × Movember»)." };
  if (!f.service_pct && !f.friend_pct && !f.product_pct) return { error: "Sett minst én rabatt." };
  const sb = await createClient();
  const id = String(fd.get("id") ?? "").trim();
  const { error } = id
    ? await sb.from("promo_campaigns").update(f).eq("id", id)
    : await sb.from("promo_campaigns").insert({ ...f, slug: makeSlug(f.name) });
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/admin/qr-tilbud");
  return { ok: true };
}

export async function togglePromo(id: string, active: boolean): Promise<void> {
  if (!(await guard()) || !id) return;
  const sb = await createClient();
  await sb.from("promo_campaigns").update({ active }).eq("id", id);
  revalidatePath("/admin/qr-tilbud");
}
