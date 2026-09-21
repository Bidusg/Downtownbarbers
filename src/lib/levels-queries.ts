import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * NIVÅER & PRISING
 *   staff_levels (junior/barber/senior/master) + pris per nivå × tjeneste
 *   (service_level_prices). Nivå styrer også hvilke tjenester en ansatt
 *   leverer (positiv tilknytning i staff_services).
 * ===================================================================== */

export type StaffLevel = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
};

export async function getLevels(): Promise<StaffLevel[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff_levels")
      .select("id, slug, name, sort_order")
      .order("sort_order");
    return (data as StaffLevel[]) ?? [];
  } catch {
    return [];
  }
}

export type PriceService = {
  id: string;
  name: string;
  categoryName: string;
  base_price_nok: number;
};

/** Tjenester (aktive) + basispris, sortert for prismatrisen. */
export async function getServicesForPricing(): Promise<PriceService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("id, name, price_nok, sort_order, service_categories(name, sort_order)")
      .eq("active", true)
      .order("sort_order");
    return (data ?? []).map((r) => {
      const cat = r.service_categories as { name?: string } | null;
      return {
        id: r.id as string,
        name: r.name as string,
        categoryName: cat?.name ?? "—",
        base_price_nok: Number(r.price_nok) || 0,
      };
    });
  } catch {
    return [];
  }
}

/** service_id → level_id → pris (kun satte nivåpriser). */
export async function getServiceLevelPrices(): Promise<
  Record<string, Record<string, number>>
> {
  const out: Record<string, Record<string, number>> = {};
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("service_level_prices")
      .select("service_id, level_id, price_nok");
    for (const r of (data ?? []) as {
      service_id: string;
      level_id: string;
      price_nok: number;
    }[]) {
      (out[r.service_id] ??= {})[r.level_id] = Number(r.price_nok) || 0;
    }
  } catch {
    // tomt
  }
  return out;
}

/** staff_id → service_id[] (positiv tjeneste-tilknytning). */
export async function getStaffServiceMap(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  try {
    const sb = await createClient();
    const { data } = await sb.from("staff_services").select("staff_id, service_id");
    for (const r of (data ?? []) as {
      staff_id: string;
      service_id: string;
    }[]) {
      (out[r.staff_id] ??= []).push(r.service_id);
    }
  } catch {
    // tomt
  }
  return out;
}

export type PickerService = { id: string; name: string; categoryName: string };

/** Aktive tjenester (id + navn + kategori) for velgeren i «Rediger ansatt». */
export async function getServicesForPicker(): Promise<PickerService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("id, name, sort_order, service_categories(name, sort_order)")
      .eq("active", true)
      .order("sort_order");
    return (data ?? []).map((r) => {
      const cat = r.service_categories as { name?: string } | null;
      return {
        id: r.id as string,
        name: r.name as string,
        categoryName: cat?.name ?? "—",
      };
    });
  } catch {
    return [];
  }
}
