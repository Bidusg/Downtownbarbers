"use server";

import { revalidatePath } from "next/cache";
import { saveSiteSettings, type SiteSettings } from "@/lib/site-settings";

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
