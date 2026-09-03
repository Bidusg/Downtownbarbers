import { createClient } from "@/lib/supabase/server";
import { salon } from "@/lib/data/salon";

export type OpeningHour = { day: string; hours: string };

export type SiteSettings = {
  name: string;
  slogan: string;
  established: string;
  hero_title: string;
  hero_italic: string;
  intro: string;
  about_text: string;
  cta_title: string;
  cta_text: string;
  phone: string;
  address: string;
  email: string | null;
  opening_hours: OpeningHour[];
  accent_hex: string;
  show_rating: boolean;
  rating_value: number;
  rating_count: number;
};

const fallback: SiteSettings = {
  name: salon.name,
  slogan: salon.slogan,
  established: String(salon.established),
  hero_title: "Klipp skarpt.",
  hero_italic: "Se enda skarpere ut.",
  intro: salon.intro,
  about_text:
    "Premium håndverk midt i Oslo sentrum. Presis, erfaren, rolig – vi tar hånd om detaljene før du rekker å spørre, i stolen som i speilet.",
  cta_title: "Klar for en skarpere fade?",
  cta_text: "Velg tjeneste, barber og tid på sekunder.",
  phone: salon.phone,
  address: salon.address,
  email: null,
  opening_hours: salon.openingHours as OpeningHour[],
  accent_hex: "#F47721",
  show_rating: true,
  rating_value: salon.rating,
  rating_count: salon.ratingCount,
};

/** Forsidens innhold – fra DB, fallback til statiske verdier. */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const sb = await createClient();
    const { data } = await sb.from("site_settings").select("*").eq("id", 1).single();
    if (data) return { ...fallback, ...(data as Partial<SiteSettings>) };
  } catch {
    // fallback
  }
  return fallback;
}

/** Admin lagrer innstillinger (RLS krever admin-rolle). */
export async function saveSiteSettings(
  patch: Partial<SiteSettings>,
): Promise<{ ok?: true; error?: string }> {
  try {
    const sb = await createClient();
    const { error } = await sb
      .from("site_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return { error: error.message };
    return { ok: true };
  } catch {
    return { error: "Kunne ikke lagre." };
  }
}
