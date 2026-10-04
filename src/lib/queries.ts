import { createClient } from "@/lib/supabase/server";
import {
  serviceCategories as staticCats,
  team as staticTeam,
} from "@/lib/data/salon";
import { getServicePopularity } from "@/lib/service-catalog-queries";

export type PublicService = {
  name: string;
  description: string;
  price: string;
  duration: string;
  category: string;
};
export type PublicBarber = { name: string; title: string; photo?: string | null };

const kr = (n: number) => `${n} kr`;

/**
 * Tjenester for den offentlige booking-veiviseren, fallback til statiske data.
 * Viser kun tjenester som er `active = true` OG `online_bookable = true`.
 *
 * Sorteringsregel: kategori-gruppering bevares (kategoriens sort_order først),
 * og innen hver kategori sorteres tjenestene på POPULARITET (flest fullførte
 * bookinger siste 90 dager) synkende, med tjenestens sort_order som manuell
 * overstyring/tiebreak (stigende), deretter navn. Resultatet er en flat liste
 * der kategoriene er sammenhengende og i riktig rekkefølge.
 */
export async function getPublicServices(): Promise<PublicService[]> {
  try {
    const sb = await createClient();
    const [{ data }, popularity] = await Promise.all([
      sb
        .from("services")
        .select(
          "id, name, description, price_nok, duration_min, sort_order, service_categories(name, sort_order)",
        )
        .eq("active", true)
        .eq("online_bookable", true),
      getServicePopularity(90),
    ]);
    if (data && data.length) {
      const rows = data.map((r) => {
        const cat = r.service_categories as
          | { name?: string; sort_order?: number }
          | null;
        return {
          id: r.id as string,
          name: r.name as string,
          description: (r.description as string) ?? "",
          price: kr(r.price_nok as number),
          duration: `${r.duration_min} min`,
          category: cat?.name ?? "Annet",
          catSort: cat?.sort_order ?? 0,
          serviceSort: (r.sort_order as number) ?? 0,
          popularity: popularity.get(r.id as string) ?? 0,
        };
      });
      rows.sort(
        (a, b) =>
          a.catSort - b.catSort ||
          a.category.localeCompare(b.category) ||
          b.popularity - a.popularity ||
          a.serviceSort - b.serviceSort ||
          a.name.localeCompare(b.name),
      );
      return rows.map(({ name, description, price, duration, category }) => ({
        name,
        description,
        price,
        duration,
        category,
      }));
    }
  } catch {
    // faller tilbake under
  }
  return staticCats.flatMap((c) =>
    c.services.map((s) => ({
      name: s.name,
      description: s.description,
      price: s.price,
      duration: s.duration,
      category: c.name,
    })),
  );
}

/** Barbere fra Supabase (aktive), fallback til statiske data. */
export async function getPublicBarbers(): Promise<PublicBarber[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("full_name, title, photo_url")
      .eq("active", true)
      .order("employee_number");
    if (data && data.length) {
      return data.map((r) => ({
        name: r.full_name as string,
        title: (r.title as string) ?? "Barber",
        photo: (r.photo_url as string | null) ?? null,
      }));
    }
  } catch {
    // fallback under
  }
  return staticTeam.map((b) => ({ name: b.name, title: b.title }));
}

export type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  price_nok: number;
  image_url: string | null;
  is_gift_card: boolean;
};

/** Produkter fra Supabase (aktive). Tom liste hvis ingen/feil. */
export async function getPublicProducts(): Promise<PublicProduct[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("products")
      .select("id, name, description, price_nok, image_url, is_gift_card")
      .eq("active", true)
      .order("is_gift_card")
      .order("name");
    if (data && data.length) return data as PublicProduct[];
  } catch {
    // tom liste under
  }
  return [];
}

/** Grupperer tjenester etter kategori (rekkefølge bevart). */
export function groupByCategory(services: PublicService[]) {
  const order: string[] = [];
  const map = new Map<string, PublicService[]>();
  for (const s of services) {
    if (!map.has(s.category)) {
      map.set(s.category, []);
      order.push(s.category);
    }
    map.get(s.category)!.push(s);
  }
  return order.map((name) => ({ name, services: map.get(name)! }));
}
