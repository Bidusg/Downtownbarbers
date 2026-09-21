"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import type { NoticeAudience, NoticeLevel } from "@/lib/notices-queries";

const LEVELS: NoticeLevel[] = ["info", "warning", "critical"];
const AUDIENCES: NoticeAudience[] = ["all", "admin", "shop", "ansatt"];

/** Konverterer en datetime-local-verdi til ISO, eller null hvis tom. */
function toIsoOrNull(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Oppretter en ny driftsmelding. Kun admin. */
export async function createNotice(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const levelRaw = String(formData.get("level") ?? "info");
  const audienceRaw = String(formData.get("audience") ?? "all");
  const active = formData.get("active") != null;
  const starts_at = toIsoOrNull(String(formData.get("starts_at") ?? ""));
  const ends_at = toIsoOrNull(String(formData.get("ends_at") ?? ""));

  if (!title) return;

  const level: NoticeLevel = LEVELS.includes(levelRaw as NoticeLevel)
    ? (levelRaw as NoticeLevel)
    : "info";
  const audience: NoticeAudience = AUDIENCES.includes(
    audienceRaw as NoticeAudience,
  )
    ? (audienceRaw as NoticeAudience)
    : "all";

  const sb = await createClient();
  await sb.from("notices").insert({
    title,
    body: body || null,
    level,
    audience,
    active,
    starts_at,
    ends_at,
    created_by: me.userId,
  });

  revalidatePath("/admin/meldinger");
}

/** Slår en melding av eller på. Kun admin. */
export async function toggleNotice(id: string, active: boolean): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

  const sb = await createClient();
  await sb.from("notices").update({ active }).eq("id", id);
  revalidatePath("/admin/meldinger");
}

/** Sletter en melding. Kun admin. */
export async function deleteNotice(id: string): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

  const sb = await createClient();
  await sb.from("notices").delete().eq("id", id);
  revalidatePath("/admin/meldinger");
}
