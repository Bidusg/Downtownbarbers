import { createClient } from "@/lib/supabase/server";

export type PublicAddon = {
  name: string;
  price: number; // kr (fast pris)
  durationMin: number; // ekstra tid tillegget legger på timen
};

/**
 * Tilleggstjenester (kategori «Tillegg») – vises som «legg til» i booking.
 * De er aktive men online_bookable=false, så de dukker ikke opp i hovedlista.
 */
export async function getPublicAddons(): Promise<PublicAddon[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("name, price_nok, duration_min, sort_order, service_categories!inner(name)")
      .eq("active", true)
      .eq("service_categories.name", "Tillegg")
      .order("sort_order");
    return (data ?? []).map((r) => ({
      name: r.name as string,
      price: Number(r.price_nok) || 0,
      durationMin: Number(r.duration_min) || 0,
    }));
  } catch {
    return [];
  }
}
