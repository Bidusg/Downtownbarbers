"use server";

import { revalidatePath } from "next/cache";
import { saveSiteSettings, type SiteSettings } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { SITE_BUCKET, type SiteSection } from "@/lib/site-images";

export async function updateSite(
  patch: Partial<SiteSettings>,
): Promise<{ ok?: true; error?: string }> {
  const res = await saveSiteSettings(patch);
  if (res.ok) {
    revalidatePath("/");
    revalidatePath("/admin/nettside");
  }
  return res;
}

/* ----------------------- NETTSIDE-BILDER (CMS) ----------------------- */

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

function refreshSite() {
  revalidatePath("/");
  revalidatePath("/admin/nettside");
}

/** Last opp et bilde/klipp til en seksjon (hero/galleri). Kun admin. */
export async function uploadSiteImage(formData: FormData): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };

  const section = String(formData.get("section") ?? "") as SiteSection;
  if (section !== "hero" && section !== "gallery") {
    return { error: "Ugyldig seksjon." };
  }
  const file = formData.get("file") as File | null;
  const alt = String(formData.get("alt") ?? "").trim();
  if (!file || file.size === 0) return { error: "Du må velge en fil." };

  const kind = (file.type || "").startsWith("video/") ? "video" : "image";
  // Galleriet viser bilder (ikke klipp) – klipp hører til hero-karusellen.
  if (section === "gallery" && kind === "video") {
    return { error: "Galleriet støtter bilder. Legg klipp i hero-karusellen." };
  }
  const path = `${section}/${crypto.randomUUID()}-${slug(file.name)}`;

  const sb = await createClient();
  const { error } = await sb.storage.from(SITE_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { error: "Opplastingen feilet. Prøv igjen." };

  // Ny sort_order = bakerst i seksjonen.
  const { data: last } = await sb
    .from("site_images")
    .select("sort_order")
    .eq("section", section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (Number(last?.sort_order) || 0) + 1;

  const { error: dbErr } = await sb.from("site_images").insert({
    section,
    kind,
    path,
    alt: alt || null,
    sort_order: nextOrder,
    active: true,
  });
  if (dbErr) {
    await sb.storage.from(SITE_BUCKET).remove([path]);
    return { error: "Kunne ikke lagre bildet. Prøv igjen." };
  }

  refreshSite();
  return { ok: true };
}

/** Slett et bilde (Storage-objekt + metadata). Kun admin. */
export async function deleteSiteImage(id: string): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: row } = await sb
    .from("site_images")
    .select("path")
    .eq("id", id)
    .maybeSingle();
  if (row?.path) {
    await sb.storage.from(SITE_BUCKET).remove([row.path as string]);
  }
  const { error } = await sb.from("site_images").delete().eq("id", id);
  if (error) return { error: "Kunne ikke slette bildet." };
  refreshSite();
  return { ok: true };
}

/** Slå et bilde av/på (inaktive vises kun i forhåndsvisning). Kun admin. */
export async function toggleSiteImage(id: string, active: boolean): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { error } = await sb.from("site_images").update({ active }).eq("id", id);
  if (error) return { error: "Kunne ikke oppdatere." };
  refreshSite();
  return { ok: true };
}

/** Flytt et bilde opp/ned i rekkefølgen innen seksjonen. Kun admin. */
export async function moveSiteImage(id: string, dir: "up" | "down"): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: me } = await sb
    .from("site_images")
    .select("id, section, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!me) return { error: "Fant ikke bildet." };

  const neighborQ = sb
    .from("site_images")
    .select("id, sort_order")
    .eq("section", me.section as string);
  const { data: other } =
    dir === "up"
      ? await neighborQ
          .lt("sort_order", me.sort_order as number)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle()
      : await neighborQ
          .gt("sort_order", me.sort_order as number)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
  if (!other) return { ok: true }; // allerede ytterst

  await sb
    .from("site_images")
    .update({ sort_order: other.sort_order as number })
    .eq("id", me.id as string);
  await sb
    .from("site_images")
    .update({ sort_order: me.sort_order as number })
    .eq("id", other.id as string);

  refreshSite();
  return { ok: true };
}

/* ------------------- HÅNDVERKET-BLOKKER (etappe 2) ------------------- */

/** Ny håndverk-blokk: bilde + tittel + tekst. Kun admin. */
export async function createCraft(formData: FormData): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!file || file.size === 0) return { error: "Du må velge et bilde." };
  if (!title) return { error: "Skriv en tittel." };
  if ((file.type || "").startsWith("video/")) {
    return { error: "Håndverket støtter bilder, ikke klipp." };
  }

  const path = `craft/${crypto.randomUUID()}-${slug(file.name)}`;
  const sb = await createClient();
  const { error } = await sb.storage.from(SITE_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { error: "Opplastingen feilet. Prøv igjen." };

  const { data: last } = await sb
    .from("site_craft")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (Number(last?.sort_order) || 0) + 1;

  const { error: dbErr } = await sb.from("site_craft").insert({
    image_path: path,
    title,
    body: body || null,
    sort_order: nextOrder,
    active: true,
  });
  if (dbErr) {
    await sb.storage.from(SITE_BUCKET).remove([path]);
    return { error: "Kunne ikke lagre blokken. Prøv igjen." };
  }
  refreshSite();
  return { ok: true };
}

/** Lagre tekst (tittel + brødtekst) på en håndverk-blokk. Kun admin. */
export async function saveCraftText(
  id: string,
  title: string,
  body: string,
): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const t = title.trim();
  if (!t) return { error: "Skriv en tittel." };
  const sb = await createClient();
  const { error } = await sb
    .from("site_craft")
    .update({ title: t, body: body.trim() || null })
    .eq("id", id);
  if (error) return { error: "Kunne ikke lagre." };
  refreshSite();
  return { ok: true };
}

/** Slett en håndverk-blokk (bilde + rad). Kun admin. */
export async function deleteCraft(id: string): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: row } = await sb
    .from("site_craft")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (row?.image_path) {
    await sb.storage.from(SITE_BUCKET).remove([row.image_path as string]);
  }
  const { error } = await sb.from("site_craft").delete().eq("id", id);
  if (error) return { error: "Kunne ikke slette." };
  refreshSite();
  return { ok: true };
}

/** Slå en håndverk-blokk av/på. Kun admin. */
export async function toggleCraft(id: string, active: boolean): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { error } = await sb.from("site_craft").update({ active }).eq("id", id);
  if (error) return { error: "Kunne ikke oppdatere." };
  refreshSite();
  return { ok: true };
}

/** Flytt en håndverk-blokk opp/ned i rekkefølgen. Kun admin. */
export async function moveCraft(id: string, dir: "up" | "down"): Promise<Result> {
  if (!(await adminGuard())) return { error: "Ingen tilgang." };
  const sb = await createClient();
  const { data: me } = await sb
    .from("site_craft")
    .select("id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!me) return { error: "Fant ikke blokken." };

  const base = sb.from("site_craft").select("id, sort_order");
  const { data: other } =
    dir === "up"
      ? await base
          .lt("sort_order", me.sort_order as number)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle()
      : await base
          .gt("sort_order", me.sort_order as number)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
  if (!other) return { ok: true };

  await sb
    .from("site_craft")
    .update({ sort_order: other.sort_order as number })
    .eq("id", me.id as string);
  await sb
    .from("site_craft")
    .update({ sort_order: me.sort_order as number })
    .eq("id", other.id as string);

  refreshSite();
  return { ok: true };
}
