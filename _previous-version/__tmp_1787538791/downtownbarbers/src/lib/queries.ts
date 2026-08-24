import { createClient } from "@/lib/supabase/server";
import {
  serviceCategories as staticCats,
  team as staticTeam,
} from "@/lib/data/salon";

export type PublicService = {
  name: string;
  description: string;
  price: string;
  duration: string;
  category: string;
};
export type PublicBarber = { name: string; title: string };

const kr = (n: number) => `${n} kr`;

/** Tjenester fra Supabase (aktive), fallback til statiske data ved feil/tom. */
export async function getPublicServices(): Promise<PublicService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("name, description, price_nok, duration_min, service_categories(name)")
      .eq("active", true)
      .order("sort_order");
    if (data && data.length) {
      return data.map((r) => {
        const cat = r.service_categories as { name?: string } | null;
        return {
          name: r.name as string,
          description: (r.description as string) ?? "",
          price: kr(r.price_nok as number),
          duration: `${r.duration_min} min`,
          category: cat?.name ?? "Annet",
        };
      });
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
      .select("full_name, title")
      .eq("active", true)
      .order("employee_number");
    if (data && data.length) {
      return data.map((r) => ({
        name: r.full_name as string,
        title: (r.title as string) ?? "Barber",
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

const mockProducts: PublicProduct[] = [
  { id: "m1", name: "Matt Pomade", description: "Sterkt hold, matt finish. 100 ml.", price_nok: 249, image_url: null, is_gift_card: false },
  { id: "m2", name: "Skjeggolje", description: "Pleiende olje for mykt skjegg. 30 ml.", price_nok: 199, image_url: null, is_gift_card: false },
  { id: "m3", name: "Rensende Shampoo", description: "Daglig shampoo. 250 ml.", price_nok: 179, image_url: null, is_gift_card: false },
  { id: "m4", name: "Gavekort 500 kr", description: "Digitalt gavekort.", price_nok: 500, image_url: null, is_gift_card: true },
];

/** Produkter fra Supabase (aktive), fallback til mock. */
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
    // fallback under
  }
  return mockProducts;
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
