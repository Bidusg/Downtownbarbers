"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "staff-files"; // offentlig bilde-bøtte (som profilbildene)

export type PortfolioResult = { ok?: true; error?: string };

function done(staffId: string) {
  revalidatePath("/admin/ansatte/portefolje");
  revalidatePath("/barbere/[slug]", "page");
  void staffId;
}

/** Last opp ett bilde av arbeidet (bildet er allerede nedskalert i nettleseren). */
export async function uploadPortfolioImage(staffId: string, formData: FormData): Promise<PortfolioResult> {
  await requireRole(["admin"]);
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { error: "Velg et bilde." };
  if (!file.type.startsWith("image/")) return { error: "Filen må være et bilde." };
  if (file.size > 3.5 * 1024 * 1024) return { error: "Bildet er for stort (maks 3,5 MB)." };
  const sb = await createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `portfolio/${staffId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `Opplasting feilet: ${upErr.message}` };
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data: last } = await sb
    .from("staff_portfolio")
    .select("sort_order")
    .eq("staff_id", staffId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await sb.from("staff_portfolio").insert({
    staff_id: staffId,
    image_url: url,
    sort_order: ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 1,
  });
  if (error) {
    return {
      error: /staff_portfolio/.test(error.message)
        ? "Kjør KJØR-I-SUPABASE-PORTEFOLJE.sql i Supabase først."
        : `Kunne ikke lagre: ${error.message}`,
    };
  }
  done(staffId);
  return { ok: true };
}

export async function deletePortfolioImage(id: string): Promise<PortfolioResult> {
  await requireRole(["admin"]);
  const sb = await createClient();
  const { data: row } = await sb.from("staff_portfolio").select("staff_id, image_url").eq("id", id).maybeSingle();
  const { error } = await sb.from("staff_portfolio").delete().eq("id", id);
  if (error) return { error: error.message };
  // Fjern filen også (best-effort).
  const url = (row as { image_url?: string } | null)?.image_url ?? "";
  const m = /\/object\/public\/staff-files\/(.+)$/.exec(url);
  if (m) await sb.storage.from(BUCKET).remove([decodeURIComponent(m[1])]);
  done((row as { staff_id?: string } | null)?.staff_id ?? "");
  return { ok: true };
}

/** Flytt et bilde ett hakk frem/tilbake (rekkefølgen styrer e-post og galleri). */
export async function movePortfolioImage(id: string, dir: -1 | 1): Promise<PortfolioResult> {
  await requireRole(["admin"]);
  const sb = await createClient();
  const { data: row } = await sb.from("staff_portfolio").select("staff_id").eq("id", id).maybeSingle();
  const staffId = (row as { staff_id?: string } | null)?.staff_id;
  if (!staffId) return { error: "Fant ikke bildet." };
  const { data } = await sb
    .from("staff_portfolio")
    .select("id")
    .eq("staff_id", staffId)
    .order("sort_order")
    .order("created_at");
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((rid, k) => sb.from("staff_portfolio").update({ sort_order: k + 1 }).eq("id", rid)));
  done(staffId);
  return { ok: true };
}
