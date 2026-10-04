import { createClient } from "@/lib/supabase/server";

export type ShopBarber = { id: string; full_name: string };
export type ShopService = { name: string; duration_min: number };

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
      .select("name, duration_min")
      .eq("active", true)
      .order("name");
    return (data as ShopService[]) ?? [];
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
      sb.from("bookings").select("id, group_id, person_label").in("id", ids),
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
        },
      ]),
    );
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
      addons: addonsById.get(b.id) ?? [],
    }));
  } catch {
    return [];
  }
}
