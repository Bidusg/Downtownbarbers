import { createClient } from "@/lib/supabase/server";
import type { SectionFlags } from "@/lib/site-sections-config";

/* =====================================================================
 * FORSIDE-SEKSJONER (av/på) – DB-oppslag (kun server).
 *   Ren konfig/typer ligger i site-sections-config.ts (klient-trygg).
 * ===================================================================== */

/** Hent av/på-status for alle seksjoner. Feiler trygt → alt på (som før). */
export async function getSectionFlags(): Promise<SectionFlags> {
  try {
    const sb = await createClient();
    const { data } = await sb.from("site_section_flags").select("key, visible");
    const out: SectionFlags = {};
    for (const r of (data ?? []) as { key: string; visible: boolean }[]) {
      out[r.key] = r.visible !== false;
    }
    return out;
  } catch {
    return {};
  }
}
