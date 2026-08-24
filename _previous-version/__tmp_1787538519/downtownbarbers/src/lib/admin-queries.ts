import { createClient } from "@/lib/supabase/server";

export type AdminService = {
  id: string;
  name: string;
  description: string | null;
  price_nok: number;
  duration_min: number;
  active: boolean;
  category_id: string | null;
  categoryName: string;
};

export type Category = { id: string; name: string };

export type AdminStaff = {
  id: string;
  employee_number: string | null;
  full_name: string;
  title: string | null;
  bio: string | null;
  photo_url: string | null;
  contract_url: string | null;
  active: boolean;
};

export type AdminBooking = {
  id: string;
  start_at: string;
  status: string;
  price_nok: number;
  customer: string;
  service: string;
  barber: string;
};

export async function getCategories(): Promise<Category[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("service_categories")
      .select("id, name")
      .order("sort_order");
    return (data as Category[]) ?? [];
  } catch {
    return [];
  }
}

export async function getServicesAdmin(): Promise<AdminService[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select(
        "id, name, description, price_nok, duration_min, active, category_id, service_categories(name)",
      )
      .order("sort_order");
    return (
      (data ?? []).map((r) => {
        const cat = r.service_categories as { name?: string } | null;
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          price_nok: r.price_nok,
          duration_min: r.duration_min,
          active: r.active,
          category_id: r.category_id,
          categoryName: cat?.name ?? "—",
        } as AdminService;
      })
    );
  } catch {
    return [];
  }
}

export async function getStaffAdmin(): Promise<AdminStaff[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select(
        "id, employee_number, full_name, title, bio, photo_url, contract_url, active",
      )
      .order("employee_number");
    return (data as AdminStaff[]) ?? [];
  } catch {
    return [];
  }
}

export type AdminCustomer = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  visits: number;
};

export async function getCustomers(): Promise<AdminCustomer[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("customers")
      .select("id, full_name, phone, email, category, bookings(count)")
      .order("full_name");
    return (data ?? []).map((r) => {
      const bk = r.bookings as { count?: number }[] | null;
      return {
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        category: r.category,
        visits: bk?.[0]?.count ?? 0,
      } as AdminCustomer;
    });
  } catch {
    return [];
  }
}

export async function getUpcomingBookings(): Promise<AdminBooking[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("bookings")
      .select(
        "id, start_at, status, price_nok, customers(full_name), services(name), staff(full_name)",
      )
      .order("start_at", { ascending: true })
      .limit(50);
    return (data ?? []).map((r) => {
      const c = r.customers as { full_name?: string } | null;
      const s = r.services as { name?: string } | null;
      const b = r.staff as { full_name?: string } | null;
      return {
        id: r.id,
        start_at: r.start_at,
        status: r.status,
        price_nok: r.price_nok,
        customer: c?.full_name ?? "—",
        service: s?.name ?? "—",
        barber: b?.full_name ?? "—",
      } as AdminBooking;
    });
  } catch {
    return [];
  }
}
