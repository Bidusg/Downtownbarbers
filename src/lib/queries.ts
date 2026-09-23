import { createClient } from "@/lib/supabase/server";
import {
  serviceCategories as staticCats,
  team as staticTeam,
} from "@/lib/data/salon";
import { getServicePopularity } from "@/lib/service-catalog-queries";
import { asStaffLevel, type StaffLevel } from "@/lib/levels";

/** Nivå-overstyrt pris/varighet for én tjeneste (kun nivåer som er satt). */
export type LevelPrice = { price: number; duration: number };
export type LevelPriceMap = Partial<Record<StaffLevel, LevelPrice>>;

export type PublicService = {
  name: string;
  description: string;
  price: string;
  duration: string;
  category: string;
  /** Grunnpris/-varighet som tall (for nivå-beregning). */
  basePrice: number;
  baseDuration: number;
  /** Pris/varighet per nivå (overstyrer grunnverdiene). */
  levelPrices: LevelPriceMap;
};
export type PublicBarber = { name: string; title: string; level: StaffLevel };

const kr = (n: number) => `${n} kr`;

/** Første tall i en streng ("349 kr" → 349, "30 min" → 30). */
function firstInt(s: string): number {
  const m = String(s).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

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
      // Nivå-priser for disse tjenestene (én spørring, gruppert per tjeneste).
      const ids = data.map((r) => r.id as string);
      const levelMap = new Map<string, LevelPriceMap>();
      const { data: lp } = await sb
        .from("service_level_prices")
        .select("service_id, level, price_nok, duration_min")
        .in("service_id", ids);
      for (const row of lp ?? []) {
        const sid = row.service_id as string;
        const lvl = asStaffLevel(row.level as string);
        const m = levelMap.get(sid) ?? {};
        m[lvl] = {
          price: Number(row.price_nok) || 0,
          duration:
            row.duration_min != null
              ? Number(row.duration_min)
              : Number(data.find((d) => d.id === sid)?.duration_min) || 30,
        };
        levelMap.set(sid, m);
      }

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
          basePrice: Number(r.price_nok) || 0,
          baseDuration: Number(r.duration_min) || 30,
          levelPrices: levelMap.get(r.id as string) ?? {},
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
      return rows.map(
        ({
          name,
          description,
          price,
          duration,
          category,
          basePrice,
          baseDuration,
          levelPrices,
        }) => ({
          name,
          description,
          price,
          duration,
          category,
          basePrice,
          baseDuration,
          levelPrices,
        }),
      );
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
      basePrice: firstInt(s.price),
      baseDuration: firstInt(s.duration),
      levelPrices: {},
    })),
  );
}

/** Barbere fra Supabase (aktive), fallback til statiske data. */
export async function getPublicBarbers(): Promise<PublicBarber[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("full_name, title, level")
      .eq("active", true)
      .order("employee_number");
    if (data && data.length) {
      return data.map((r) => ({
        name: r.full_name as string,
        title: (r.title as string) ?? "Barber",
        level: asStaffLevel(r.level as string),
      }));
    }
  } catch {
    // fallback under
  }
  return staticTeam.map((b) => ({
    name: b.name,
    title: b.title,
    level: "barber" as StaffLevel,
  }));
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
