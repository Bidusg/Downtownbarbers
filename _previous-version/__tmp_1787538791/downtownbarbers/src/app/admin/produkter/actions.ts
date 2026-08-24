"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "staff-files";

export async function createProduct(formData: FormData) {
  const sb = await createClient();

  let image_url: string | null = null;
  const img = formData.get("image") as File | null;
  if (img && img.size > 0) {
    const ext = img.name.split(".").pop() ?? "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage
      .from(BUCKET)
      .upload(path, img, { upsert: true, contentType: img.type || undefined });
    if (!error) {
      image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
  }

  await sb.from("products").insert({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    price_nok: Number(formData.get("price_nok") ?? 0),
    stock: Number(formData.get("stock") ?? 0),
    is_gift_card: formData.get("is_gift_card") === "on",
    image_url,
    active: true,
  });
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
}

export async function toggleProduct(id: string, active: boolean) {
  const sb = await createClient();
  await sb.from("products").update({ active }).eq("id", id);
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
}

export async function deleteProduct(id: string) {
  const sb = await createClient();
  await sb.from("products").delete().eq("id", id);
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
}
