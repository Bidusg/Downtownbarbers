import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contentKey, contentMaps } from "@/lib/i18n/content-map";
import { getSiteSettings } from "@/lib/site-settings";
import { getSiteCraft } from "@/lib/site-images";
import { deeplTranslate, getDeeplConfig, DeeplError } from "@/lib/deepl";

/* =====================================================================
 * «Oversett alt som mangler» – samler norske tekster fra admin og lar
 * DeepL oversette dem som ikke har engelsk fra før. Resultatet lagres i
 * content_translations (leses av nettsiden via getDbContentEn).
 *   Hopper over: tekster med håndskrevet engelsk (services.name_en …),
 *   tekster den faste ordlista allerede dekker, og alt som er oversatt før.
 *   Faste tekster i admin → Nettside (site_texts) med norsk men uten
 *   engelsk får engelsk direkte i site_texts.en.
 * ===================================================================== */

export type TranslateResult = { ok: boolean; translated: number; message: string };

type Item = { map: string; src: string };

export async function translateMissing(opts: { onlyIfAuto?: boolean } = {}): Promise<TranslateResult> {
  const cfg = await getDeeplConfig();
  if (!cfg.key) return { ok: false, translated: 0, message: "Ingen DeepL-nøkkel er lagt inn." };
  if (opts.onlyIfAuto && !cfg.auto) return { ok: true, translated: 0, message: "Automatisk oversettelse er av." };

  const sb = await createClient();
  const items: Item[] = [];
  const push = (map: string, s: string | null | undefined) => {
    const v = (s ?? "").trim();
    if (v) items.push({ map, src: v });
  };

  // Tjenester + kategorier (hopp over de som har engelsk skrevet for hånd).
  {
    const withEn = await sb.from("services").select("name, description, name_en, description_en");
    const rows = (withEn.error
      ? (await sb.from("services").select("name, description")).data
      : withEn.data) as { name: string; description: string | null; name_en?: string | null; description_en?: string | null }[] | null;
    for (const r of rows ?? []) {
      if (!(r.name_en ?? "").trim()) push("services", r.name);
      if (!(r.description_en ?? "").trim()) push("services", r.description);
    }
    const cats = await sb.from("service_categories").select("*");
    for (const c of (cats.data ?? []) as { name: string; name_en?: string | null }[]) {
      if (!(c.name_en ?? "").trim()) push("services", c.name);
    }
  }

  // Forsidetekster + Håndverket.
  const s = await getSiteSettings();
  for (const v of [s.slogan, s.hero_title, s.hero_italic, s.intro, s.about_text, s.cta_title, s.cta_text]) {
    push("settings", v);
  }
  for (const c of await getSiteCraft(true)) {
    push("settings", c.title);
    push("settings", c.body);
  }

  // Hva er dekket fra før?
  const existing = new Set<string>();
  const { data: done, error: readErr } = await sb.from("content_translations").select("map, key");
  if (readErr) {
    return { ok: false, translated: 0, message: "Kjør KJØR-I-SUPABASE-DEEPL.sql i Supabase først." };
  }
  for (const r of (done ?? []) as { map: string; key: string }[]) existing.add(`${r.map}|${r.key}`);
  const staticKeys = (map: string) =>
    new Set(Object.keys(contentMaps[map] ?? {}).map((k) => contentKey(k)));
  const covered: Record<string, Set<string>> = {
    services: staticKeys("services"),
    settings: staticKeys("settings"),
  };

  const seen = new Set<string>();
  const todo = items.filter((it) => {
    const k = `${it.map}|${contentKey(it.src)}`;
    if (seen.has(k) || existing.has(k) || covered[it.map]?.has(contentKey(it.src))) return false;
    seen.add(k);
    return true;
  });

  // Faste tekster (site_texts) med norsk, men uten engelsk.
  const { data: textRows } = await sb.from("site_texts").select("key, no, en");
  const textTodo = ((textRows ?? []) as { key: string; no: string | null; en: string | null }[]).filter(
    (r) => (r.no ?? "").trim() && !(r.en ?? "").trim(),
  );

  if (!todo.length && !textTodo.length) {
    return { ok: true, translated: 0, message: "Alt er allerede oversatt." };
  }

  try {
    const en = await deeplTranslate(cfg.key, [
      ...todo.map((t) => t.src),
      ...textTodo.map((r) => (r.no ?? "").trim()),
    ]);
    const now = new Date().toISOString();
    if (todo.length) {
      const { error } = await sb.from("content_translations").upsert(
        todo.map((t, i) => ({
          map: t.map,
          key: contentKey(t.src),
          src: t.src,
          en: en[i],
          auto: true,
          updated_at: now,
        })),
        { onConflict: "map,key" },
      );
      if (error) return { ok: false, translated: 0, message: "Kunne ikke lagre oversettelsene." };
    }
    for (let i = 0; i < textTodo.length; i++) {
      await sb
        .from("site_texts")
        .update({ en: en[todo.length + i], updated_at: now })
        .eq("key", textTodo[i].key);
    }
    revalidatePath("/", "layout");
    const n = todo.length + textTodo.length;
    return { ok: true, translated: n, message: `${n} tekst${n === 1 ? "" : "er"} oversatt.` };
  } catch (e) {
    return {
      ok: false,
      translated: 0,
      message: e instanceof DeeplError ? e.message : "Kunne ikke nå DeepL. Prøv igjen.",
    };
  }
}

/** Kalles etter lagring i admin: oversetter i bakgrunnen hvis det er slått på. Velter aldri lagringen. */
export async function autoTranslateAfterSave(): Promise<void> {
  try {
    await translateMissing({ onlyIfAuto: true });
  } catch {
    /* oversettelse skal aldri stoppe en lagring */
  }
}
