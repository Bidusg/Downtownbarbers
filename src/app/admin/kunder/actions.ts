"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Oppdaterer hele kundekortet. Fanger e-post-konflikt (unik e-post) pent. */
export async function updateCustomer(id: string, formData: FormData) {
  const sb = await createClient();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const { error } = await sb
    .from("customers")
    .update({
      full_name: full_name || "Uten navn",
      phone: clean(formData.get("phone")),
      email: clean(formData.get("email")),
      category: clean(formData.get("category")),
      notes: clean(formData.get("notes")),
    })
    .eq("id", id);
  if (error) {
    const msg = /uq_customers_email_ci|duplicate/i.test(error.message)
      ? "e-post-finnes"
      : "feil";
    redirect(`/admin/kunder/${id}?lagret=${msg}`);
  }
  revalidatePath(`/admin/kunder/${id}`);
  redirect(`/admin/kunder/${id}?lagret=ok`);
}

/**
 * GDPR – anonymiser kunde (rett til sletting). Fjerner personopplysninger,
 * men beholder de anonymiserte salgs-/bookingradene av hensyn til
 * bokføringsplikten (salgshistorikk må oppbevares). Irreversibelt.
 */
export async function anonymizeCustomer(id: string) {
  const sb = await createClient();
  await sb
    .from("customers")
    .update({
      full_name: "Anonymisert kunde",
      email: null,
      phone: null,
      notes: null,
      source: null,
      category: "anonymisert",
    })
    .eq("id", id);
  revalidatePath(`/admin/kunder/${id}`);
  revalidatePath("/admin/kunder");
  redirect(`/admin/kunder/${id}?lagret=anonymisert`);
}

/** Oppretter en ny kunde manuelt fra kartoteket. */
export async function createCustomer(formData: FormData) {
  const sb = await createClient();
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return;
  const { data, error } = await sb
    .from("customers")
    .insert({
      full_name,
      phone: clean(formData.get("phone")),
      email: clean(formData.get("email")),
      category: clean(formData.get("category")),
      notes: clean(formData.get("notes")),
    })
    .select("id")
    .single();
  if (error || !data) {
    redirect("/admin/kunder?nykunde=feil");
  }
  revalidatePath("/admin/kunder");
  redirect(`/admin/kunder/${data.id}`);
}
