import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";

export type MyBooking = {
  id: string;
  start_at: string;
  customer: string;
  service: string;
  status: string;
};

export type MyAgenda = {
  staffName: string | null;
  linked: boolean;
  bookings: MyBooking[];
};

/** Innlogget ansatts kommende timer (matchet på e-post mot staff). */
export async function getMyAgenda(): Promise<MyAgenda> {
  try {
    const me = await getUserRole();
    if (!me?.email) return { staffName: null, linked: false, bookings: [] };
    const sb = await createClient();

    const { data: staff } = await sb
      .from("staff")
      .select("id, full_name")
      .ilike("email", me.email)
      .maybeSingle();

    if (!staff) return { staffName: null, linked: false, bookings: [] };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data } = await sb
      .from("bookings")
      .select("id, start_at, status, customers(full_name), services(name)")
      .eq("staff_id", staff.id)
      .gte("start_at", startOfToday.toISOString())
      .order("start_at", { ascending: true })
      .limit(50);

    const bookings: MyBooking[] = (data ?? []).map((b) => {
      const c = b.customers as { full_name?: string } | null;
      const s = b.services as { name?: string } | null;
      return {
        id: b.id,
        start_at: b.start_at,
        customer: c?.full_name ?? "—",
        service: s?.name ?? "—",
        status: b.status,
      };
    });

    return { staffName: staff.full_name, linked: true, bookings };
  } catch {
    return { staffName: null, linked: false, bookings: [] };
  }
}
