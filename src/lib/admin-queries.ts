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
  customerPhone: string | null;
  customerEmail: string | null;
  service: string;
  barber: string;
};

export type AdminProduct = {
  id: string;
  name: string;
  description: string | null;
  price_nok: number;
  stock: number;
  active: boolean;
  is_gift_card: boolean;
  image_url: string | null;
};

export async function getProductsAdmin(): Promise<AdminProduct[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("products")
      .select("id, name, description, price_nok, stock, active, is_gift_card, image_url")
      .order("name");
    return (data as AdminProduct[]) ?? [];
  } catch {
    return [];
  }
}

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
  visits: number; // antall bookinger som ikke er avbestilt
  lastVisit: string | null; // ISO – siste booking
  totalSpent: number; // sum av fullførte bookinger (kr)
  noShows: number;
};

type CustomerBookingRow = {
  status: string;
  price_nok: number;
  start_at: string;
};

function summarizeBookings(rows: CustomerBookingRow[]) {
  const active = rows.filter((b) => b.status !== "cancelled");
  const lastVisit = active.reduce<string | null>(
    (acc, b) => (!acc || b.start_at > acc ? b.start_at : acc),
    null,
  );
  const totalSpent = rows
    .filter((b) => b.status === "completed")
    .reduce((s, b) => s + (Number(b.price_nok) || 0), 0);
  const noShows = rows.filter((b) => b.status === "no_show").length;
  return { visits: active.length, lastVisit, totalSpent, noShows };
}

export async function getCustomers(): Promise<AdminCustomer[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("customers")
      .select("id, full_name, phone, email, category, bookings(status, price_nok, start_at)")
      .order("full_name");
    return (data ?? []).map((r) => {
      const bk = (r.bookings as CustomerBookingRow[] | null) ?? [];
      const s = summarizeBookings(bk);
      return {
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        category: r.category,
        ...s,
      } as AdminCustomer;
    });
  } catch {
    return [];
  }
}

export type CustomerBooking = {
  id: string;
  start_at: string;
  status: string;
  price_nok: number;
  service: string;
  barber: string;
};

export type AdminCustomerDetail = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
  visits: number;
  totalSpent: number;
  noShows: number;
  lastVisit: string | null;
  bookings: CustomerBooking[];
};

export async function getCustomer(
  id: string,
): Promise<AdminCustomerDetail | null> {
  try {
    const sb = await createClient();
    const { data: c } = await sb
      .from("customers")
      .select("id, full_name, phone, email, category, notes, created_at")
      .eq("id", id)
      .single();
    if (!c) return null;
    const { data: bkRaw } = await sb
      .from("bookings")
      .select("id, start_at, status, price_nok, services(name), staff(full_name)")
      .eq("customer_id", id)
      .order("start_at", { ascending: false });
    const bookings: CustomerBooking[] = (bkRaw ?? []).map((r) => {
      const s = r.services as { name?: string } | null;
      const b = r.staff as { full_name?: string } | null;
      return {
        id: r.id,
        start_at: r.start_at,
        status: r.status,
        price_nok: Number(r.price_nok) || 0,
        service: s?.name ?? "—",
        barber: b?.full_name ?? "—",
      };
    });
    const s = summarizeBookings(bookings);
    return {
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      email: c.email,
      category: c.category,
      notes: c.notes,
      created_at: c.created_at,
      bookings,
      ...s,
    };
  } catch {
    return null;
  }
}

export async function getUpcomingBookings(): Promise<AdminBooking[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("bookings")
      .select(
        "id, start_at, status, price_nok, customers(full_name, phone, email), services(name), staff(full_name)",
      )
      .order("start_at", { ascending: true })
      .limit(100);
    return (data ?? []).map((r) => {
      const c = r.customers as
        | { full_name?: string; phone?: string; email?: string }
        | null;
      const s = r.services as { name?: string } | null;
      const b = r.staff as { full_name?: string } | null;
      return {
        id: r.id,
        start_at: r.start_at,
        status: r.status,
        price_nok: r.price_nok,
        customer: c?.full_name ?? "—",
        customerPhone: c?.phone ?? null,
        customerEmail: c?.email ?? null,
        service: s?.name ?? "—",
        barber: b?.full_name ?? "—",
      } as AdminBooking;
    });
  } catch {
    return [];
  }
}
