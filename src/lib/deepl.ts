import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * DeepL – maskinoversettelse norsk → engelsk (kun server).
 *   Nøkkel: DEEPL_API_KEY i Vercel, ellers lagret i admin → Integrasjoner
 *   (translation_config). Gratisnøkler slutter på «:fx» og bruker
 *   api-free.deepl.com; betalte bruker api.deepl.com.
 * ===================================================================== */

export type DeeplConfig = { key: string | null; auto: boolean; fromEnv: boolean };

export async function getDeeplConfig(): Promise<DeeplConfig> {
  const env = (process.env.DEEPL_API_KEY ?? "").trim();
  let key: string | null = env || null;
  let auto = true;
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("translation_config")
      .select("deepl_api_key, auto")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      auto = data.auto !== false;
      if (!key) key = ((data.deepl_api_key as string | null) ?? "").trim() || null;
    }
  } catch {
    /* tabellen finnes ikke ennå → bare env */
  }
  return { key, auto, fromEnv: !!env };
}

const base = (key: string) =>
  key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";

export class DeeplError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function explain(status: number): string {
  if (status === 403) return "DeepL avviste nøkkelen. Sjekk at den er riktig kopiert.";
  if (status === 456) return "Månedskvoten hos DeepL er brukt opp.";
  if (status === 429) return "For mange forespørsler til DeepL. Prøv igjen om litt.";
  return `DeepL svarte med feil (${status}).`;
}

/** Oversett en liste tekster (norsk → britisk engelsk). Samme rekkefølge ut. */
export async function deeplTranslate(key: string, texts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += 40) {
    const chunk = texts.slice(i, i + 40);
    const res = await fetch(`${base(key)}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: chunk,
        source_lang: "NB",
        target_lang: "EN-GB",
        preserve_formatting: true,
        // Vanlige ord i bransjen som ikke skal oversettes rart.
        context:
          "Text from the website of Downtown Barbers, a barbershop in Oslo, Norway. Services are haircuts, fades, beard trims and shaves.",
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new DeeplError(res.status, explain(res.status));
    const json = (await res.json()) as { translations?: { text: string }[] };
    const tr = json.translations ?? [];
    if (tr.length !== chunk.length) throw new DeeplError(500, "Uventet svar fra DeepL.");
    out.push(...tr.map((t) => t.text));
  }
  return out;
}

/** Forbruk denne måneden (tegn brukt / grense). */
export async function deeplUsage(
  key: string,
): Promise<{ used: number; limit: number }> {
  const res = await fetch(`${base(key)}/v2/usage`, {
    headers: { Authorization: `DeepL-Auth-Key ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new DeeplError(res.status, explain(res.status));
  const j = (await res.json()) as { character_count?: number; character_limit?: number };
  return { used: j.character_count ?? 0, limit: j.character_limit ?? 0 };
}
