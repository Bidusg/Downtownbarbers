import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * NETTSIDE-BILDER (CMS)
 *   Bildegalleri (site_media) = alle bilder som finnes: opplastede filer i
 *   den offentlige 'site'-bøtta OG de innebygde bildene i repoet (/img/…).
 *   Plasseringer (site_images) = hvilke bilder som vises i hvilken seksjon,
 *   i hvilken rekkefølge, og om de er aktive. Håndverket-blokker (site_craft)
 *   peker også på et bilde i galleriet.
 *   Forsiden bruker AKTIVE plasseringer; inaktive vises kun i forhåndsvisning.
 * ===================================================================== */

export const SITE_BUCKET = "site";
export type { SiteSection, SiteMedia, SiteImage, CraftBlock } from "@/lib/site-sections";
export { SECTION_META } from "@/lib/site-sections";
import type { SiteSection, SiteMedia, SiteImage, CraftBlock } from "@/lib/site-sections";

type Row = {
  id: string;
  section: SiteSection;
  kind: "image" | "video";
  path: string;
  alt: string | null;
  sort_order: number;
  active: boolean;
  media_id: string | null;
  site_media: { path: string; kind: "image" | "video"; alt: string | null } | null;
};

/** Offentlig URL for en sti: «/img/…» serveres fra repoet, ellers fra Storage. */
export function mediaUrl(
  sb: Awaited<ReturnType<typeof createClient>>,
  path: string,
): string {
  if (path.startsWith("/")) return path;
  return sb.storage.from(SITE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Hele bildegalleriet (nyeste først). */
export async function getSiteMedia(): Promise<SiteMedia[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("site_media")
      .select("id, path, kind, alt, label, created_at")
      .order("created_at", { ascending: false });
    return ((data ?? []) as {
      id: string;
      path: string;
      kind: "image" | "video";
      alt: string | null;
      label: string | null;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      path: r.path,
      kind: r.kind,
      url: mediaUrl(sb, r.path),
      alt: r.alt,
      label: r.label,
      builtin: r.path.startsWith("/"),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Alle plasseringer (alle seksjoner), sortert innen seksjon.
 * includeInactive=true tar med inaktive (til admin + forhåndsvisning).
 */
export async function getSiteImages(includeInactive = false): Promise<SiteImage[]> {
  try {
    const sb = await createClient();
    let q = sb
      .from("site_images")
      .select("id, section, kind, path, alt, sort_order, active, media_id, site_media(path, kind, alt)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!includeInactive) q = q.eq("active", true);
    const { data } = await q;
    return ((data as unknown as Row[]) ?? []).map((r) => {
      const path = r.site_media?.path ?? r.path;
      return {
        id: r.id,
        section: r.section,
        kind: r.site_media?.kind ?? r.kind,
        url: mediaUrl(sb, path),
        alt: r.alt ?? r.site_media?.alt ?? null,
        sortOrder: r.sort_order,
        active: r.active,
        mediaId: r.media_id,
      };
    });
  } catch {
    return [];
  }
}

/* ----------------- HÅNDVERKET-BLOKKER ----------------- */

type CraftRow = {
  id: string;
  image_path: string;
  media_id: string | null;
  title: string;
  body: string | null;
  sort_order: number;
  active: boolean;
  site_media: { path: string } | null;
};

/**
 * «Håndverket»-blokkene (bilde + tittel + tekst), sortert. includeInactive=true
 * tar med skjulte (admin + forhåndsvisning).
 */
export async function getSiteCraft(includeInactive = false): Promise<CraftBlock[]> {
  try {
    const sb = await createClient();
    let q = sb
      .from("site_craft")
      .select("id, image_path, media_id, title, body, sort_order, active, site_media(path)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!includeInactive) q = q.eq("active", true);
    const { data } = await q;
    return ((data as unknown as CraftRow[]) ?? []).map((r) => ({
      id: r.id,
      imageUrl: mediaUrl(sb, r.site_media?.path ?? r.image_path),
      mediaId: r.media_id,
      title: r.title,
      body: r.body,
      sortOrder: r.sort_order,
      active: r.active,
    }));
  } catch {
    return [];
  }
}
