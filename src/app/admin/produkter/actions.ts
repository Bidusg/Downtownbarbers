"use server";

import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "staff-files";

export async function createProduct(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
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
  await requireRole(["admin"]);
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
  await requireRole(["admin"]);
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
  await requireRole(["admin"]);
  const sb = await createClient();
  const { error } = await sb.from("products").update({ active }).eq("id", id);
  if (error) return { error: `Kunne ikke endre status: ${error.message}` };
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin"]);
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

/* =====================================================================
 * NETTBUTIKK – produktinnhold, bilder og butikk-innstillinger.
 * ===================================================================== */

const clean = (v: FormDataEntryValue | null, max = 4000) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

function level(v: FormDataEntryValue | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export async function updateWebProduct(formData: FormData): Promise<{ ok?: true; error?: string; slug?: string }> {
  await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Mangler produkt-ID." };
  const name = String(formData.get("name") ?? "");
  const slug = slugify(String(formData.get("slug") ?? "") || String(formData.get("web_name") ?? "") || name);
  if (!slug) return { error: "Produktet trenger en nettadresse." };
  const compare = Number(String(formData.get("compare_at_price_nok") ?? "").replace(",", "."));
  const sort = Number(formData.get("web_sort") ?? 0);

  const fields = {
    slug,
    web_name: clean(formData.get("web_name"), 200),
    brand: clean(formData.get("brand"), 120),
    category: clean(formData.get("category"), 80),
    short_description: clean(formData.get("short_description"), 400),
    description: clean(formData.get("description")),
    benefits: String(formData.get("benefits") ?? "")
      .split("\n")
      .map((x) => x.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 12),
    recommended_for: clean(formData.get("recommended_for"), 1000),
    how_to_use: clean(formData.get("how_to_use"), 1500),
    ingredients: clean(formData.get("ingredients"), 3000),
    size_label: clean(formData.get("size_label"), 60),
    hold_level: level(formData.get("hold_level")),
    shine_level: level(formData.get("shine_level")),
    compare_at_price_nok: Number.isFinite(compare) && compare > 0 ? compare : null,
    related_slugs: String(formData.get("related_slugs") ?? "")
      .split(/[,\n]/)
      .map((x) => slugify(x))
      .filter(Boolean)
      .slice(0, 8),
    featured: formData.get("featured") === "on",
    online: formData.get("online") === "on",
    web_sort: Number.isInteger(sort) ? sort : 0,
    content_review: formData.get("content_review") === "on",
  };

  const sb = await createClient();
  const { error } = await sb.from("products").update(fields).eq("id", id);
  if (error) {
    if (/products_slug_uidx|duplicate|unique/i.test(error.message)) return { error: "Nettadressen er allerede brukt av et annet produkt." };
    if (/column/i.test(error.message)) return { error: "Kjør KJØR-I-SUPABASE-NETTBUTIKK.sql i Supabase først." };
    return { error: `Kunne ikke lagre: ${error.message}` };
  }
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk", "layout");
  return { ok: true, slug };
}

/** Last opp ett bilde (kalles én gang per bilde fra nettleseren). Returnerer ny bildeliste. */
export async function uploadProductImage(id: string, formData: FormData): Promise<{ images?: string[]; error?: string }> {
  await requireRole(["admin"]);
  const img = formData.get("image") as File | null;
  if (!img || img.size === 0) return { error: "Ingen fil." };
  if (!/^image\/(jpeg|png|webp|avif)$/.test(img.type)) return { error: "Bruk JPG, PNG eller WebP." };
  if (img.size > 3.5 * 1024 * 1024) return { error: "Bildet er for stort (maks 3,5 MB)." };
  const sb = await createClient();
  const { data: cur } = await sb.from("products").select("images, image_url").eq("id", id).maybeSingle();
  if (!cur) return { error: "Fant ikke produktet." };
  const ext = img.type === "image/png" ? "png" : img.type === "image/webp" ? "webp" : img.type === "image/avif" ? "avif" : "jpg";
  const path = `products/${id}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, img, { contentType: img.type, upsert: false });
  if (upErr) return { error: `Opplasting feilet (${upErr.message}).` };
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const existing = ((cur.images as string[] | null) ?? []).filter(Boolean);
  const base = existing.length ? existing : cur.image_url ? [cur.image_url as string] : [];
  const images = [...base, url].slice(0, 10);
  const { error } = await sb.from("products").update({ images, image_url: images[0] }).eq("id", id);
  if (error) return { error: `Kunne ikke lagre bildet: ${error.message}` };
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk", "layout");
  return { images };
}

/** Lagre ny rekkefølge / fjern bilder. Første bilde = hovedbilde. */
export async function setProductImages(id: string, images: string[]): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const list = images.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 10);
  const sb = await createClient();
  const { error } = await sb.from("products").update({ images: list, image_url: list[0] ?? null }).eq("id", id);
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk", "layout");
  return { ok: true };
}

export type WebshopForm = {
  live: boolean;
  shipping_nok: number;
  free_over_nok: number;
  pickup: boolean;
  ship: boolean;
  pay_at_pickup: boolean;
};

export async function saveWebshopSettings(v: WebshopForm): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const ship = Math.max(0, Math.min(1000, Math.round(Number(v.shipping_nok) || 0)));
  const free = Math.max(0, Math.min(100000, Math.round(Number(v.free_over_nok) || 0)));
  if (!v.pickup && !v.ship) return { error: "Minst én leveringsmåte må være på." };
  const sb = await createClient();
  const { error } = await sb.from("settings").upsert(
    {
      key: "webshop",
      value: { live: !!v.live, shipping_nok: ship, free_over_nok: free, pickup: !!v.pickup, ship: !!v.ship, pay_at_pickup: !!v.pay_at_pickup },
    },
    { onConflict: "key" },
  );
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk", "layout");
  return { ok: true };
}
