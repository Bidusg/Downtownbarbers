import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Bilder av arbeidet (portefølje) per barber.
 *   Tabell staff_portfolio (KJØR-I-SUPABASE-PORTEFOLJE.sql). Brukes av
 *   admin-siden, den offentlige barbersiden (/barbere/<slug>) og e-poster
 *   der barberen er fremhevet. Tåler at tabellen ikke finnes ennå.
 * ===================================================================== */

export type PortfolioImage = { id: string; url: string; caption: string | null; sort: number };

/** «Søren Nilsen» / «Riccardo» → «soren» / «riccardo» (fornavn, uten æøå). */
export function barberSlug(name: string): string {
  const first = (name || "").trim().split(/\s+/)[0] ?? "";
  return first
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getPortfolio(staffId: string): Promise<PortfolioImage[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("staff_portfolio")
      .select("id, image_url, caption, sort_order")
      .eq("staff_id", staffId)
      .order("sort_order")
      .order("created_at");
    if (error) return [];
    return ((data ?? []) as { id: string; image_url: string; caption: string | null; sort_order: number }[]).map(
      (r) => ({ id: r.id, url: r.image_url, caption: r.caption, sort: r.sort_order }),
    );
  } catch {
    return [];
  }
}

export type PublicBarberProfile = {
  id: string;
  fullName: string;
  name: string; // visningsnavn
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
  slug: string;
  images: PortfolioImage[];
};

/** Aktiv barber ut fra slug (fornavn/visningsnavn). */
export async function getBarberBySlug(slug: string): Promise<PublicBarberProfile | null> {
  try {
    const sb = await createClient();
    const first = await sb
      .from("staff")
      .select("id, full_name, display_name, title, bio, photo_url")
      .eq("active", true);
    let data = first.data;
    if (first.error) {
      const fb = await sb.from("staff").select("id, full_name, title, bio, photo_url").eq("active", true);
      data = (fb.data ?? []).map((r) => ({ ...r, display_name: null })) as typeof data;
    }
    const rows = (data ?? []) as {
      id: string;
      full_name: string;
      display_name: string | null;
      title: string | null;
      bio: string | null;
      photo_url: string | null;
    }[];
    const hit = rows.find((r) => barberSlug(r.display_name || r.full_name) === slug);
    if (!hit) return null;
    return {
      id: hit.id,
      fullName: hit.full_name,
      name: (hit.display_name || hit.full_name).trim(),
      title: hit.title,
      bio: hit.bio,
      photoUrl: hit.photo_url,
      slug,
      images: await getPortfolio(hit.id),
    };
  } catch {
    return null;
  }
}

/** Galleri til e-post: per fullt navn → bilde-URL-er + lenke til barbersiden. */
export async function getEmailGalleries(
  names: string[],
  base: string,
  db?: SupabaseClient,
): Promise<Map<string, { images: string[]; url: string }>> {
  const out = new Map<string, { images: string[]; url: string }>();
  if (!names.length) return out;
  try {
    const sb: SupabaseClient = db ?? (await createClient());
    const first = await sb
      .from("staff")
      .select("id, full_name, display_name")
      .in("full_name", names);
    let staff = first.data;
    if (first.error) {
      const fb = await sb.from("staff").select("id, full_name").in("full_name", names);
      staff = (fb.data ?? []).map((r) => ({ ...r, display_name: null })) as typeof staff;
    }
    const list = (staff ?? []) as { id: string; full_name: string; display_name: string | null }[];
    if (!list.length) return out;
    const { data: imgs, error: e2 } = await sb
      .from("staff_portfolio")
      .select("staff_id, image_url, sort_order, created_at")
      .in("staff_id", list.map((s) => s.id))
      .order("sort_order")
      .order("created_at");
    if (e2) return out;
    for (const s of list) {
      const images = ((imgs ?? []) as { staff_id: string; image_url: string }[])
        .filter((i) => i.staff_id === s.id)
        .map((i) => i.image_url);
      if (images.length) {
        out.set(s.full_name, { images, url: `${base}/barbere/${barberSlug(s.display_name || s.full_name)}` });
      }
    }
  } catch {
    /* uten galleri */
  }
  return out;
}
