import { createServiceClient } from "@/lib/supabase/service";

/**
 * Visningsnavn for ansatte (det som står på nettsiden, f.eks. «Ayaan»)
 * i stedet for fullt navn (f.eks. «Qasim Ali Qezelbash») i e-post og SMS.
 * Bruker staff.display_name når den er satt, ellers navnet slik det kom inn.
 * Hurtigbufres i 60 s. Feiler stille → navnet brukes uendret.
 */
let cache: { at: number; map: Map<string, string> } | null = null;

async function loadMap(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.map;
  const map = new Map<string, string>();
  try {
    const { data, error } = await createServiceClient()
      .from("staff")
      .select("full_name, display_name");
    if (!error) {
      for (const r of (data ?? []) as { full_name: string | null; display_name: string | null }[]) {
        const full = r.full_name?.trim();
        const disp = r.display_name?.trim();
        if (full && disp) map.set(full.toLowerCase(), disp);
      }
    }
  } catch {
    /* ingen visningsnavn – bruk fullt navn */
  }
  cache = { at: Date.now(), map };
  return map;
}

/** Fullt navn → visningsnavn (eller uendret hvis ukjent/ikke satt). */
export async function staffDisplayName(name: string | null | undefined): Promise<string> {
  const n = (name ?? "").trim();
  if (!n) return "";
  const map = await loadMap();
  return map.get(n.toLowerCase()) ?? n;
}
