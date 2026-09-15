import { createClient } from "@/lib/supabase/server";
import { salon } from "@/lib/data/salon";

export type OpeningHour = { day: string; hours: string };

/** Strukturert åpningstid per ukedag (0=søndag … 6=lørdag). null = stengt. */
export type DayHours = { open: string; close: string } | null;
export type HoursMap = Record<string, DayHours>;

const DAY_NAMES = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Man → Søn

const DEFAULT_HOURS: HoursMap = {
  "1": { open: "09:00", close: "21:00" },
  "2": { open: "09:00", close: "21:00" },
  "3": { open: "09:00", close: "21:00" },
  "4": { open: "09:00", close: "21:00" },
  "5": { open: "09:00", close: "21:00" },
  "6": { open: "09:00", close: "21:00" },
  "0": null,
};

/** Gjør strukturerte åpningstider om til pen, gruppert visningstekst. */
export function groupOpeningHours(hours: HoursMap): OpeningHour[] {
  const text = (dow: number) => {
    const h = hours?.[String(dow)];
    return h && h.open && h.close ? `${h.open} – ${h.close}` : "Stengt";
  };
  const out: OpeningHour[] = [];
  let i = 0;
  while (i < DISPLAY_ORDER.length) {
    const t = text(DISPLAY_ORDER[i]);
    let j = i;
    while (j + 1 < DISPLAY_ORDER.length && text(DISPLAY_ORDER[j + 1]) === t) j++;
    const label =
      i === j
        ? DAY_NAMES[DISPLAY_ORDER[i]]
        : `${DAY_NAMES[DISPLAY_ORDER[i]]}–${DAY_NAMES[DISPLAY_ORDER[j]]}`;
    out.push({ day: label, hours: t });
    i = j + 1;
  }
  return out;
}

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
  hours: HoursMap; // strukturert kilde – styrer visning OG booking
  opening_hours: OpeningHour[]; // avledet visningstekst (fra hours)
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
  hours: DEFAULT_HOURS,
  opening_hours: groupOpeningHours(DEFAULT_HOURS),
  accent_hex: "#F47721",
  show_rating: true,
  rating_value: salon.rating,
  rating_count: salon.ratingCount,
};

/** Forsidens innhold – fra DB, fallback til statiske verdier.
 *  Visnings-åpningstidene (opening_hours) avledes ALLTID fra strukturen
 *  (hours), slik at forside, footer og booking aldri spriker. */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const sb = await createClient();
    const { data } = await sb.from("site_settings").select("*").eq("id", 1).single();
    if (data) {
      const merged = { ...fallback, ...(data as Partial<SiteSettings>) };
      const hours =
        merged.hours && typeof merged.hours === "object"
          ? merged.hours
          : DEFAULT_HOURS;
      return { ...merged, hours, opening_hours: groupOpeningHours(hours) };
    }
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
    // opening_hours er avledet – ikke skriv den tilbake som «sannhet».
    const { opening_hours: _drop, ...rest } = patch;
    void _drop;
    const { error } = await sb
      .from("site_settings")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return { error: error.message };
    return { ok: true };
  } catch {
    return { error: "Kunne ikke lagre." };
  }
}
