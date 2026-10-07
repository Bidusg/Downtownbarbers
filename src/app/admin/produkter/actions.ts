"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "staff-files";

export async function createProduct(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price_nok") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  if (!name) return { error: "Produktet må ha et navn." };
  if (!Number.isFinite(price) || price < 0) return { error: "Ugyldig pris." };
  if (!Number.isInteger(stock) || stock < 0) return { error: "Lager må være et helt tall (0 eller mer)." };

  const sb = await createClient();

  let image_url: string | null = null;
  const img = formData.get("image") as File | null;
  if (img && img.size > 0) {
    const ext = img.name.split(".").pop() ?? "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, img, { upsert: true, contentType: img.type || undefined });
    if (error) {
      return { error: `Bildet kunne ikke lastes opp (${error.message}). Produktet ble ikke lagret.` };
    }
    image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { error } = await sb.from("products").insert({
    name,
    description: String(formData.get("description") ?? "") || null,
    price_nok: price,
    stock,
    is_gift_card: formData.get("is_gift_card") === "on",
    barcode: String(formData.get("barcode") ?? "").trim() || null,
    image_url,
    active: true,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Strekkoden er allerede i bruk på et annet produkt."
        : `Kunne ikke lagre produktet: ${error.message}`,
    };
  }
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
  return { ok: true };
}

export async function updateProduct(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price_nok") ?? 0);
  if (!id) return { error: "Mangler produkt-ID." };
  if (!name) return { error: "Produktet må ha et navn." };
  if (!Number.isFinite(price) || price < 0) return { error: "Ugyldig pris." };

  const sb = await createClient();

  const fields: {
    name: string;
    description: string | null;
    price_nok: number;
    image_url?: string;
  } = {
    name,
    description: String(formData.get("description") ?? "") || null,
    price_nok: price,
  };

  const img = formData.get("image") as File | null;
  if (img && img.size > 0) {
    const ext = img.name.split(".").pop() ?? "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, img, { upsert: true, contentType: img.type || undefined });
    if (error) {
      return { error: `Bildet kunne ikke lastes opp (${error.message}). Produktet ble ikke lagret.` };
    }
    fields.image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { error } = await sb.from("products").update(fields).eq("id", id);
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message)
        ? "Navnet er allerede i bruk på et annet produkt."
        : `Kunne ikke lagre produktet: ${error.message}`,
    };
  }
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
  return { ok: true };
}

/** Sett/endre strekkode på et produkt (tom = fjern). Kun admin/eier. */
export async function setProductBarcode(
  id: string,
  barcode: string,
): Promise<{ ok?: true; error?: string }> {
  const value = barcode.trim() || null;
  const sb = await createClient();
  const { error } = await sb
    .from("products")
    .update({ barcode: value })
    .eq("id", id);
  if (error) {
    // Mest sannsynlig unik-konflikt (strekkoden er brukt på et annet produkt).
    return {
      error: error.message.includes("duplicate")
        ? "Strekkoden er allerede i bruk på et annet produkt."
        : `Kunne ikke lagre: ${error.message}`,
    };
  }
  revalidatePath("/admin/produkter");
  return { ok: true };
}

export async function toggleProduct(
  id: string,
  active: boolean,
): Promise<{ ok?: true; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("products").update({ active }).eq("id", id);
  if (error) return { error: `Kunne ikke endre status: ${error.message}` };
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      error: /foreign key|violates/i.test(error.message)
        ? "Produktet er brukt i salg og kan ikke slettes – deaktiver det i stedet."
        : `Kunne ikke slette: ${error.message}`,
    };
  }
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
  return { ok: true };
}
