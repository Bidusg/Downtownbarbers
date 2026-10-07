"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { testReviewConnections, type ReviewConnectionTest } from "@/lib/reviews";

/**
 * Lagre omdømme-konfig (Google + TripAdvisor). Kun admin. Nøkler oppdateres
 * bare når det faktisk skrives inn en ny verdi — tomt felt beholder den
 * eksisterende nøkkelen (så man slipper å lime inn på nytt hver gang).
 * Cachen er 6t, så endringer slår inn ved neste henting/omlasting.
 */
export async function saveReviewConfig(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

  const sb = await createClient();

  const trimmed = (k: string) => String(formData.get(k) ?? "").trim();
  const googlePlaceId = trimmed("google_place_id");
  const googleKey = trimmed("google_api_key");
  const taLocationId = trimmed("tripadvisor_location_id");
  const taKey = trimmed("tripadvisor_api_key");

  // Vern mot nettleserens autofyll: en e-postadresse er aldri en Place-ID,
  // og Google-API-nøkler starter alltid med «AIza». Ser verdien ut som
  // autofylt innlogging, lagres den ikke (eksisterende verdi beholdes).
  const looksLikeLogin = (v: string) => v.includes("@") || /\s/.test(v);

  const patch: Record<string, unknown> = {
    id: 1,
    google_enabled: formData.get("google_enabled") === "on",
    tripadvisor_location_id: taLocationId || null,
    tripadvisor_enabled: formData.get("tripadvisor_enabled") === "on",
    updated_at: new Date().toISOString(),
  };
  if (!looksLikeLogin(googlePlaceId)) patch.google_place_id = googlePlaceId || null;
  if (looksLikeLogin(taLocationId)) delete patch.tripadvisor_location_id;
  // Behold eksisterende nøkkel hvis feltet er tomt eller ikke ser ut som en nøkkel.
  if (googleKey && googleKey.startsWith("AIza")) patch.google_api_key = googleKey;
  if (taKey && !looksLikeLogin(taKey)) patch.tripadvisor_api_key = taKey;

  await sb.from("review_config").upsert(patch, { onConflict: "id" });
  // Tøm bufrede Google/TripAdvisor-svar, så ny nøkkel slår inn med en gang
  // (ellers kan et gammelt feilsvar bli liggende i opptil 6 timer).
  updateTag("reviews");
  revalidatePath("/admin/rating");
  revalidatePath("/");
}


/** «Test kobling» i admin: kjører et ubufret kall mot hver kilde. */
export async function testReviewConnection(): Promise<ReviewConnectionTest | { error: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  updateTag("reviews");
  return testReviewConnections();
}
