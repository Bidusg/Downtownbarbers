import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Query-lag for dokumentsenteret (DocCenter). Generelt filarkiv for
 * salongen. Alt degraderer til tomt ved feil. Kun admin (RLS).
 * ===================================================================== */

export type DocFile = {
  id: string;
  name: string;
  path: string;
  category: string | null;
  size_bytes: number | null;
  mime: string | null;
  uploaded_by: string | null;
  created_at: string;
};

/** Lister dokumenter, nyeste først, valgfritt filtrert på kategori. */
export async function getDocuments(category?: string): Promise<DocFile[]> {
  try {
    const sb = await createClient();
    let q = sb
      .from("documents")
      .select("id, name, path, category, size_bytes, mime, uploaded_by, created_at")
      .order("created_at", { ascending: false });
    if (category) q = q.eq("category", category);
    const { data } = await q;
    return (data as DocFile[]) ?? [];
  } catch {
    return [];
  }
}

/** Distinkte kategorier som finnes (til filter-dropdown). */
export async function getDocumentCategories(): Promise<string[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("documents")
      .select("category")
      .not("category", "is", null)
      .order("category");
    const set = new Set<string>();
    for (const r of data ?? []) {
      const c = (r.category as string | null)?.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "nb-NO"));
  } catch {
    return [];
  }
}
