"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

/**
 * Lagre omdømme-konfig (Google + TripAdvisor). Kun admin. Nøkler oppdateres
 * bare når det faktisk skrives inn en ny verdi — tomt felt beholder den
 * eksisterende nøkkelen (så man slipper å lime inn på nytt hver gang).
 * Cachen er 6t, så endringer slår inn ved neste henting/omlasting.
 */
export async function saveReviewConfig(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;

  const sb = await createClient();

  const trimmed = (k: string) => String(formData.get(k) ?? "").trim();
  const googlePlaceId = trimmed("google_place_id");
  const googleKey = trimmed("google_api_key");
  const taLocationId = trimmed("tripadvisor_location_id");
  const taKey = trimmed("tripadvisor_api_key");

  const patch: Record<string, unknown> = {
    id: 1,
    google_place_id: googlePlaceId || null,
    google_enabled: formData.get("google_enabled") === "on",
    tripadvisor_location_id: taLocationId || null,
    tripadvisor_enabled: formData.get("tripadvisor_enabled") === "on",
    updated_at: new Date().toISOString(),
  };
  // Behold eksisterende nøkkel hvis feltet er tomt.
  if (googleKey) patch.google_api_key = googleKey;
  if (taKey) patch.tripadvisor_api_key = taKey;

  await sb.from("review_config").upsert(patch, { onConflict: "id" });
  revalidatePath("/admin/rating");
  revalidatePath("/");
}
