import { createClient } from "@/lib/supabase/server";
import type { TextOverrides } from "@/lib/site-texts-config";

/* =====================================================================
 * REDIGERBARE TEKSTER – DB-oppslag (kun server).
 *   Henter admin-overstyringer for faste tekster. Tomme felt utelates, så
 *   ordboken brukes som fallback i LanguageProvider. Feiler trygt → {}.
 * ===================================================================== */

export async function getSiteTexts(): Promise<TextOverrides> {
  try {
    const sb = await createClient();
    const { data } = await sb.from("site_texts").select("key, no, en");
    const out: TextOverrides = {};
    for (const r of (data ?? []) as { key: string; no: string | null; en: string | null }[]) {
      const no = (r.no ?? "").trim();
      const en = (r.en ?? "").trim();
      if (no || en) out[r.key] = { no: no || undefined, en: en || undefined };
    }
    return out;
  } catch {
    return {};
  }
}
