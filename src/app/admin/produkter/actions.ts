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
    subcategory: clean(formData.get("subcategory"), 80),
    tags: formData
      .getAll("tags")
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 12),
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
    if (/column/i.test(error.message))
      return { error: "Kjør KJØR-I-SUPABASE-NETTBUTIKK.sql og KJØR-I-SUPABASE-NETTBUTIKK-KATEGORIER.sql i Supabase først." };
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
  vipps: boolean;
  card: boolean;
};

export async function saveWebshopSettings(v: WebshopForm): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const ship = Math.max(0, Math.min(1000, Math.round(Number(v.shipping_nok) || 0)));
  const free = Math.max(0, Math.min(100000, Math.round(Number(v.free_over_nok) || 0)));
  if (!v.pickup && !v.ship) return { error: "Minst én leveringsmåte må være på." };
  const cardOn = !!v.card && process.env.VIPPS_CARD_ENABLED === "1";
  const online = !!v.vipps || cardOn;
  if (!online && !(v.pay_at_pickup && v.pickup)) return { error: "Minst én betalingsmåte må være på." };
  if (v.ship && !online) return { error: "Sending med Posten krever Vipps eller kort – «Betal ved henting» gjelder bare henting." };
  const sb = await createClient();
  const { error } = await sb.from("settings").upsert(
    {
      key: "webshop",
      value: { live: !!v.live, shipping_nok: ship, free_over_nok: free, pickup: !!v.pickup, ship: !!v.ship, pay_at_pickup: !!v.pay_at_pickup, vipps: !!v.vipps, card: !!v.card },
    },
    { onConflict: "key" },
  );
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk", "layout");
  return { ok: true };
}

/* =====================================================================
 * Bilder fra leverandørkatalogen (Fixit) og produsenter → egen lagring.
 *   Produktbildene ble hentet fra Fixit sin produktkatalog. Denne kopierer
 *   dem over til vår egen lagring, så butikken ikke er avhengig av Fixit.
 *   Tar noen om gangen (serverløse funksjoner har tidsgrense); knappen i
 *   admin kaller den på nytt til alt er kopiert.
 * ===================================================================== */
/** Bilde som ligger hos andre (Fixit, produsent, forhandler) – ikke i vår egen lagring. */
const EXTERNAL_IMG = { test: (u: string) => /^https:\/\//.test(u) && !u.includes("/storage/v1/object/public/") };

export async function copyExternalProductImages(): Promise<{ copied: number; remaining: number; failed: number; error?: string }> {
  await requireRole(["admin"]);
  const sb = await createClient();
  const { data, error } = await sb.from("products").select("id, images, image_url").limit(1000);
  if (error) return { copied: 0, remaining: 0, failed: 0, error: error.message };
  const todo = ((data ?? []) as { id: string; images: string[] | null; image_url: string | null }[]).filter(
    (p) => (p.images ?? []).some((u) => EXTERNAL_IMG.test(u)) || EXTERNAL_IMG.test(p.image_url ?? ""),
  );
  let copied = 0;
  let failed = 0;
  const started = Date.now();
  for (const p of todo) {
    if (Date.now() - started > 40_000) break;
    const list = (p.images ?? []).length ? [...(p.images as string[])] : p.image_url ? [p.image_url] : [];
    let ok = true;
    for (let i = 0; i < list.length; i++) {
      if (!EXTERNAL_IMG.test(list[i])) continue;
      try {
        const res = await fetch(list[i], {
          cache: "no-store",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; DowntownBarbersBot/1.0)", Accept: "image/*" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const type = res.headers.get("content-type") || "image/jpeg";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const buf = new Uint8Array(await res.arrayBuffer());
        const path = `products/${p.id}/fixit-${i}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        list[i] = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      } catch {
        ok = false;
      }
    }
    const { error: upd } = await sb.from("products").update({ images: list, image_url: list[0] ?? null }).eq("id", p.id);
    if (upd || !ok) failed++;
    else copied++;
  }
  revalidatePath("/admin/produkter");
  revalidatePath("/butikk", "layout");
  const remaining = Math.max(0, todo.length - copied - failed);
  return { copied, remaining, failed };
}
