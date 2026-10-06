import { createClient } from "@/lib/supabase/server";
import { isAddonCategory } from "@/lib/service-categories";

export type ShopBarber = { id: string; full_name: string };
export type ShopService = {
  name: string;
  duration_min: number;
  /** Kategorinavn (f.eks. Klipp, Skjegg, Tillegg). Brukes til gruppering i kassa. */
  category?: string;
};


export async function getBarbers(): Promise<ShopBarber[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("id, full_name")
      .eq("active", true)
      .order("full_name");
    return (data as ShopBarber[]) ?? [];
  } catch {
    return [];
  }
}

export async function getServices(): Promise<ShopService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("name, duration_min, sort_order, service_categories(name, sort_order)")
      .eq("active", true);
    const rows = ((data ?? []) as unknown as {
      name: string;
      duration_min: number;
      sort_order: number | null;
      service_categories: { name?: string; sort_order?: number } | null;
    }[]).map((r) => ({
      name: r.name,
      duration_min: Number(r.duration_min) || 30,
      category: r.service_categories?.name ?? "Annet",
      catSort: r.service_categories?.sort_order ?? 0,
      svcSort: r.sort_order ?? 0,
    }));
    // Kategori-rekkefølge som på forsiden; «Tillegg» alltid sist.
    rows.sort(
      (a, b) =>
        Number(isAddonCategory(a.category)) - Number(isAddonCategory(b.category)) ||
        a.catSort - b.catSort ||
        a.category.localeCompare(b.category) ||
        a.svcSort - b.svcSort ||
        a.name.localeCompare(b.name),
    );
    return rows.map(({ name, duration_min, category }) => ({ name, duration_min, category }));
  } catch {
    return [];
  }
}

export type AgendaAddon = { name: string; price: number };

export type AgendaBooking = {
  id: string;
  staff_id: string | null;
  barber: string | null;
  start_at: string;
  end_at: string;
  status: string;
  customer: string | null;
  service: string | null;
  phone: string | null;
  customer_id: string | null;
  email: string | null;
  // Handlekurv-booking (tillegg + gruppe). Fylles på etter dagsagendaen.
  group_id?: string | null;
  person_label?: string | null;
  addons?: AgendaAddon[];
  notes?: string | null; // kundens notat fra bookingen
  group_size?: number; // antall bookinger i samme gruppe (1 = vanlig booking)
};

export async function getDayAgenda(date: string): Promise<AgendaBooking[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("day_agenda", { p_date: date });
    const agenda = (data as AgendaBooking[]) ?? [];
    if (agenda.length === 0) return agenda;

    const ids = agenda.map((b) => b.id);

    // Gruppe/person-merkelapp + tillegg hentes separat (admin/shop har RLS).
    const [{ data: meta }, { data: addons }] = await Promise.all([
      sb.from("bookings").select("id, group_id, person_label, notes").in("id", ids),
      sb
        .from("booking_addons")
        .select("booking_id, name, price_nok")
        .in("booking_id", ids)
        .order("created_at"),
    ]);

    const metaById = new Map(
      (meta ?? []).map((m) => [
        m.id as string,
        {
          group_id: (m.group_id as string | null) ?? null,
          person_label: (m.person_label as string | null) ?? null,
          notes: (m.notes as string | null) ?? null,
        },
      ]),
    );
    // Gruppe-størrelse: en «gruppe» på én booking er bare en vanlig booking.
    const groupCount = new Map<string, number>();
    for (const m of meta ?? []) {
      const g = m.group_id as string | null;
      if (g) groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
    }
    const addonsById = new Map<string, AgendaAddon[]>();
    for (const a of addons ?? []) {
      const key = a.booking_id as string;
      const list = addonsById.get(key) ?? [];
      list.push({ name: a.name as string, price: Number(a.price_nok) || 0 });
      addonsById.set(key, list);
    }

    return agenda.map((b) => ({
      ...b,
      group_id: metaById.get(b.id)?.group_id ?? null,
      person_label: metaById.get(b.id)?.person_label ?? null,
      notes: metaById.get(b.id)?.notes ?? null,
      group_size: groupCount.get(metaById.get(b.id)?.group_id ?? "") ?? 1,
      addons: addonsById.get(b.id) ?? [],
    }));
  } catch {
    return [];
  }
}

/**
 * Barbere på vakt en gitt dag (navn). Regel: turnus (staff_hours) for ukedagen
 * ELLER konkret vakt (shifts, ikke fri) den datoen, minus fravær og «fri»-vakter.
 * Returnerer null når ingen har turnus/vakter i det hele tatt – da viser
 * kalenderen alle aktive barbere som før.
 */
export async function getBarbersOnDuty(date: string): Promise<string[] | null> {
  try {
    const sb = await createClient();
    // Samme regler som ledigheten i booking (turnus inkl. uke A/B, ekstravakt,
    // fravær, heldags fri). Ingen turnus = ikke på vakt.
    const { data, error } = await sb.rpc("staff_on_duty", { p_date: date });
    if (error || !Array.isArray(data)) return null; // før SQL er kjørt: vis alle
    return (data as unknown[]).map((x) =>
      typeof x === "string" ? x : String((x as Record<string, unknown>).staff_on_duty ?? ""),
    );
  } catch {
    return null;
  }
}
