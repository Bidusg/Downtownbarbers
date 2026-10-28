import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { SITE_TAG, SITE_REVALIDATE } from "@/lib/site-cache";
import { contentKey } from "@/lib/i18n/content-map";

/* =====================================================================
 * ENGELSKE TJENESTETEKSTER fra databasen (kun server).
 *   services.name_en / description_en og service_categories.name_en settes
 *   i admin → Tjenester. Returnerer { "services": { <norsk nøkkel>: engelsk } }
 *   som LanguageProvider bruker før den faste lista i content-map.ts.
 *   Mangler kolonnene (SQL ikke kjørt) → {} (faller tilbake til lista).
 * ===================================================================== */

export type DbContent = Record<string, Record<string, string>>;

async function load_getDbContentEn(): Promise<DbContent> {
  try {
    const sb = createPublicClient();
    const [svc, cats, tr] = await Promise.all([
      sb.from("services").select("name, description, name_en, description_en"),
      sb.from("service_categories").select("name, name_en"),
      sb.from("content_translations").select("map, key, en"),
    ]);
    const result: DbContent = {};
    // 1) Automatiske/lagrede oversettelser (DeepL) – laveste prioritet.
    if (!tr.error) {
      for (const r of (tr.data ?? []) as { map: string; key: string; en: string }[]) {
        if (r.en?.trim()) (result[r.map] ??= {})[r.key] = r.en.trim();
      }
    }
    if (svc.error) return result;
    // 2) Engelsk skrevet for hånd i admin → Tjenester vinner.
    const out: Record<string, string> = { ...(result.services ?? {}) };
    const put = (no: string | null, en: string | null) => {
      const n = (no ?? "").trim();
      const e = (en ?? "").trim();
      if (n && e) out[contentKey(n)] = e;
    };
    for (const r of (svc.data ?? []) as {
      name: string | null;
      description: string | null;
      name_en: string | null;
      description_en: string | null;
    }[]) {
      put(r.name, r.name_en);
      put(r.description, r.description_en);
    }
    if (!cats.error) {
      for (const r of (cats.data ?? []) as { name: string | null; name_en: string | null }[]) {
        put(r.name, r.name_en);
      }
    }
    return { ...result, services: out };
  } catch {
    return {};
  }
}

/** Mellomlagret (5 min, tømmes når admin lagrer). */
export const getDbContentEn = unstable_cache(load_getDbContentEn, ["getDbContentEn"], { tags: [SITE_TAG], revalidate: SITE_REVALIDATE });
