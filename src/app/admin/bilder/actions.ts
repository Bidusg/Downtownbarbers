"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { SITE_BUCKET, SECTION_META, type SiteSection } from "@/lib/site-images";

/* =====================================================================
 * BILDEGALLERI (admin → Bilder)
 *   Bibliotek (site_media) + plasseringer (site_images) + håndverk-bilde.
 * ===================================================================== */

type Result = { ok?: true; error?: string };

async function adminGuard(): Promise<boolean> {
  const me = await getUserRole();
  return !!me && isAdminRole(me.role);
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fil"
  );
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin/bilder");
  revalidatePath("/admin/nettside");
}

const VALID_SECTIONS = SECTION_META.map((s) => s.key);

/** Last opp ett eller flere bilder/klipp til biblioteket. Kun admin. */
export async function uploadMedia(formData: FormData): Promise<Result & { count?: number }> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Velg minst én fil." };
  const section = String(formData.get("section") ?? "") as SiteSection | "";
  const sb = await createClient();
  let count = 0;
  for (const file of files) {
    if (file.size > 15 * 1024 * 1024) return { error: `${file.name} er over 15 MB.`, count };
    const kind = (file.type || "").startsWith("video/") ? "video" : "image";
    const path = `media/${crypto.randomUUID()}-${slug(file.name)}`;
    const { error } = await sb.storage.from(SITE_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) return { error: `Opplastingen av ${file.name} feilet.`, count };
    const label = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
    const { data: row, error: dbErr } = await sb
      .from("site_media")
      .insert({ path, kind, alt: label, label })
      .select("id")
      .single();
    if (dbErr || !row) {
      await sb.storage.from(SITE_BUCKET).remove([path]);
      return { error: `Kunne ikke lagre ${file.name}.`, count };
    }
    count++;
    // Valgfritt: legg rett inn i en seksjon.
    if (section && (VALID_SECTIONS as string[]).includes(section)) {
      await placeMediaInternal(sb, row.id as string, section as SiteSection);
    }
  }
  refresh();
  return { ok: true, count };
}

/** Oppdater alt-tekst/visningsnavn på et bilde i biblioteket. */
export async function updateMedia(id: string, patch: { alt?: string; label?: string }): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { error } = await sb
    .from("site_media")
    .update({
      ...(patch.alt !== undefined ? { alt: patch.alt.trim() || null } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() || null } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Kunne ikke lagre." };
  // Hold alt-teksten på plasseringene i synk.
  if (patch.alt !== undefined) {
    await sb.from("site_images").update({ alt: patch.alt.trim() || null }).eq("media_id", id);
  }
  refresh();
  return { ok: true };
}

/** Slett et bilde fra biblioteket (og alle plasseringene). Innebygde filer fjernes bare fra galleriet. */
export async function deleteMedia(id: string): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: row } = await sb.from("site_media").select("path").eq("id", id).maybeSingle();
  if (!row) return { error: "Fant ikke bildet." };
  const { count } = await sb
    .from("site_craft")
    .select("id", { count: "exact", head: true })
    .eq("media_id", id);
  if ((count ?? 0) > 0)
    return { error: "Bildet brukes i en Håndverket-blokk. Bytt bilde der først." };
  const path = row.path as string;
  if (!path.startsWith("/")) {
    await sb.storage.from(SITE_BUCKET).remove([path]);
  }
  const { error } = await sb.from("site_media").delete().eq("id", id);
  if (error) return { error: "Kunne ikke slette bildet." };
  refresh();
  return { ok: true };
}

async function placeMediaInternal(
  sb: Awaited<ReturnType<typeof createClient>>,
  mediaId: string,
  section: SiteSection,
): Promise<Result> {
  const { data: m } = await sb
    .from("site_media")
    .select("path, kind, alt")
    .eq("id", mediaId)
    .maybeSingle();
  if (!m) return { error: "Fant ikke bildet." };
  if (m.kind === "video" && section !== "hero")
    return { error: "Klipp kan bare brukes i heroen." };
  const { data: exists } = await sb
    .from("site_images")
    .select("id")
    .eq("media_id", mediaId)
    .eq("section", section)
    .maybeSingle();
  if (exists) return { error: "Bildet ligger allerede i denne seksjonen." };

  const meta = SECTION_META.find((s) => s.key === section);
  if (meta?.single) {
    // Ett-bilde-seksjon: nytt bilde tar over, de andre skjules.
    await sb.from("site_images").update({ active: false }).eq("section", section);
  }
  const { data: last } = await sb
    .from("site_images")
    .select("sort_order")
    .eq("section", section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (Number(last?.sort_order) || 0) + 1;
  const { error } = await sb.from("site_images").insert({
    section,
    kind: m.kind,
    path: m.path,
    alt: m.alt,
    sort_order: nextOrder,
    active: true,
    media_id: mediaId,
  });
  if (error) return { error: "Kunne ikke legge bildet i seksjonen." };
  return { ok: true };
}

/** Legg et bilde fra biblioteket inn i en seksjon (bakerst). */
export async function placeMedia(mediaId: string, section: SiteSection): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  if (!VALID_SECTIONS.includes(section)) return { error: "Ugyldig seksjon." };
  const sb = await createClient();
  const r = await placeMediaInternal(sb, mediaId, section);
  if (r.ok) refresh();
  return r;
}

/** Fjern en plassering (bildet blir liggende i biblioteket). */
export async function removePlacement(id: string): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { error } = await sb.from("site_images").delete().eq("id", id);
  if (error) return { error: "Kunne ikke fjerne." };
  refresh();
  return { ok: true };
}

/** Vis/skjul en plassering. */
export async function togglePlacement(id: string, active: boolean): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { error } = await sb.from("site_images").update({ active }).eq("id", id);
  if (error) return { error: "Kunne ikke oppdatere." };
  refresh();
  return { ok: true };
}

/** Flytt en plassering opp/ned innen seksjonen. */
export async function movePlacement(id: string, dir: "up" | "down"): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: me } = await sb
    .from("site_images")
    .select("id, section, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!me) return { error: "Fant ikke bildet." };
  const q = sb.from("site_images").select("id, sort_order").eq("section", me.section as string);
  const { data: other } =
    dir === "up"
      ? await q.lt("sort_order", me.sort_order as number).order("sort_order", { ascending: false }).limit(1).maybeSingle()
      : await q.gt("sort_order", me.sort_order as number).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  if (!other) return { ok: true };
  await sb.from("site_images").update({ sort_order: other.sort_order as number }).eq("id", me.id as string);
  await sb.from("site_images").update({ sort_order: me.sort_order as number }).eq("id", other.id as string);
  refresh();
  return { ok: true };
}

/** Sett rekkefølgen i en seksjon eksplisitt (dra-og-slipp). */
export async function reorderSection(section: SiteSection, orderedIds: string[]): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    await sb
      .from("site_images")
      .update({ sort_order: i + 1 })
      .eq("id", orderedIds[i])
      .eq("section", section);
  }
  refresh();
  return { ok: true };
}

/** Bytt bilde på en Håndverket-blokk til et bilde fra biblioteket. */
export async function setCraftImage(craftId: string, mediaId: string): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: m } = await sb.from("site_media").select("path, kind").eq("id", mediaId).maybeSingle();
  if (!m) return { error: "Fant ikke bildet." };
  if (m.kind !== "image") return { error: "Håndverket støtter bilder, ikke klipp." };
  const { error } = await sb
    .from("site_craft")
    .update({ media_id: mediaId, image_path: m.path })
    .eq("id", craftId);
  if (error) return { error: "Kunne ikke bytte bilde." };
  refresh();
  return { ok: true };
}

/** Ny Håndverket-blokk med bilde fra biblioteket. */
export async function createCraftFromMedia(
  mediaId: string,
  title: string,
  body: string,
): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const t = title.trim();
  if (!t) return { error: "Skriv en tittel." };
  const sb = await createClient();
  const { data: m } = await sb.from("site_media").select("path, kind").eq("id", mediaId).maybeSingle();
  if (!m) return { error: "Velg et bilde." };
  if (m.kind !== "image") return { error: "Håndverket støtter bilder, ikke klipp." };
  const { data: last } = await sb
    .from("site_craft")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await sb.from("site_craft").insert({
    image_path: m.path,
    media_id: mediaId,
    title: t,
    body: body.trim() || null,
    sort_order: (Number(last?.sort_order) || 0) + 1,
    active: true,
  });
  if (error) return { error: "Kunne ikke lagre blokken." };
  refresh();
  return { ok: true };
}
