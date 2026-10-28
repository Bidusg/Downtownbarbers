import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { SITE_TAG, SITE_REVALIDATE } from "@/lib/site-cache";
import type { SectionFlags } from "@/lib/site-sections-config";

/* =====================================================================
 * FORSIDE-SEKSJONER (av/på) – DB-oppslag (kun server).
 *   Ren konfig/typer ligger i site-sections-config.ts (klient-trygg).
 * ===================================================================== */

/** Hent av/på-status for alle seksjoner. Feiler trygt → alt på (som før). */
async function load_getSectionFlags(): Promise<SectionFlags> {
  try {
    const sb = createPublicClient();
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

/** Mellomlagret (5 min, tømmes når admin lagrer). */
export const getSectionFlags = unstable_cache(load_getSectionFlags, ["getSectionFlags"], { tags: [SITE_TAG], revalidate: SITE_REVALIDATE });
