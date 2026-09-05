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
};

export async function getDayAgenda(date: string): Promise<AgendaBooking[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("day_agenda", { p_date: date });
    return (data as AgendaBooking[]) ?? [];
  } catch {
    return [];
  }
}
