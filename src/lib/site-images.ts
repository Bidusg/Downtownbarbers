import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * NETTSIDE-BILDER (CMS etappe 1)
 *   Forsidens hero-karusell og galleri, redigerbart fra admin. Bildene
 *   ligger i den offentlige 'site'-bøtta; her hentes de med public URL.
 *   Forsiden bruker AKTIVE bilder (inaktive vises kun i forhåndsvisning),
 *   og faller tilbake til de innebygde bildene når ingen er lastet opp.
 * ===================================================================== */

export const SITE_BUCKET = "site";
export type SiteSection = "hero" | "gallery";

export type SiteImage = {
  id: string;
  section: SiteSection;
  kind: "image" | "video";
  url: string;
  alt: string | null;
  sortOrder: number;
  active: boolean;
};

type Row = {
  id: string;
  section: SiteSection;
  kind: "image" | "video";
  path: string;
  alt: string | null;
  sort_order: number;
  active: boolean;
};

/**
 * Alle nettside-bilder (begge seksjoner), sortert innen seksjon.
 * includeInactive=true tar med inaktive (til admin + forhåndsvisning).
 */
export async function getSiteImages(includeInactive = false): Promise<SiteImage[]> {
  try {
    const sb = await createClient();
    let q = sb
      .from("site_images")
      .select("id, section, kind, path, alt, sort_order, active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!includeInactive) q = q.eq("active", true);
    const { data } = await q;
    return ((data as Row[]) ?? []).map((r) => ({
      id: r.id,
      section: r.section,
      kind: r.kind,
      url: sb.storage.from(SITE_BUCKET).getPublicUrl(r.path).data.publicUrl,
      alt: r.alt,
      sortOrder: r.sort_order,
      active: r.active,
    }));
  } catch {
    return [];
  }
}
