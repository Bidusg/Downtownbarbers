import { createClient } from "@/lib/supabase/server";

export type AdminService = {
  id: string;
  name: string;
  description: string | null;
  price_nok: number;
  duration_min: number;
  active: boolean;
  online_bookable: boolean;
  category_id: string | null;
  categoryName: string;
  name_en?: string | null;
  description_en?: string | null;
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
  has_pin: boolean;
  profile_id: string | null;
  email: string | null;
  postnummer: string | null;
  level_id: string | null;
  base_salary_nok: number | null;
  display_name: string | null;
  start_date?: string | null;
  end_date?: string | null;
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
  barcode: string | null;
  // Nettbutikk (null/tomt hvis KJØR-I-SUPABASE-NETTBUTIKK.sql ikke er kjørt)
  slug?: string | null;
  web_name?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[] | null;
  short_description?: string | null;
  benefits?: string[] | null;
  recommended_for?: string | null;
  how_to_use?: string | null;
  ingredients?: string | null;
  size_label?: string | null;
  hold_level?: number | null;
  shine_level?: number | null;
  images?: string[] | null;
  related_slugs?: string[] | null;
  compare_at_price_nok?: number | null;
  featured?: boolean | null;
  online?: boolean | null;
  web_sort?: number | null;
  content_review?: boolean | null;
  content_note?: string | null;
};

const PRODUCT_WEB_COLS =
  "slug, web_name, brand, category, short_description, benefits, recommended_for, how_to_use, ingredients, size_label, hold_level, shine_level, images, related_slugs, compare_at_price_nok, featured, online, web_sort, content_review, content_note";

export async function getProductsAdmin(): Promise<AdminProduct[]> {
  try {
    const sb = await createClient();
    const base = "id, name, description, price_nok, stock, active, is_gift_card, image_url, barcode";
    const full = await sb.from("products").select(`${base}, ${PRODUCT_WEB_COLS}, subcategory, tags`).order("name");
    if (!full.error) return (full.data as AdminProduct[]) ?? [];
    // Kategori-kolonnene (NETTBUTIKK-KATEGORIER.sql) mangler → uten dem.
    const web = await sb.from("products").select(`${base}, ${PRODUCT_WEB_COLS}`).order("name");
    if (!web.error) return (web.data as AdminProduct[]) ?? [];
    // Nettbutikk-kolonnene finnes ikke ennå → vis de vanlige feltene.
    const { data } = await sb.from("products").select(base).order("name");
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
    const base =
      "id, name, description, price_nok, duration_min, active, online_bookable, category_id, service_categories(name)";
    // Engelske felt (KJØR-I-SUPABASE-ENGELSK-TJENESTER.sql); uten dem → uten.
    const withEn = await sb.from("services").select(`${base}, name_en, description_en`).order("sort_order");
    const data = (
      withEn.error ? (await sb.from("services").select(base).order("sort_order")).data : withEn.data
    ) as unknown as Record<string, unknown>[] | null;
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
          online_bookable: r.online_bookable ?? true,
          category_id: r.category_id,
          categoryName: cat?.name ?? "—",
          name_en: (r.name_en as string | null | undefined) ?? null,
          description_en: (r.description_en as string | null | undefined) ?? null,
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
    const cols =
      "id, employee_number, full_name, title, bio, photo_url, contract_url, active, email, postnummer, profile_id, pin_hash, level_id, base_salary_nok, display_name";
    const withDates = await sb
      .from("staff")
      .select(cols + ", start_date, end_date")
      .order("employee_number");
    let { data, error } = withDates.error
      ? await sb.from("staff").select(cols).order("employee_number")
      : (withDates as unknown as { data: Record<string, unknown>[] | null; error: null });
    if (error) {
      // En nyere kolonne mangler (SQL ikke kjørt) → vis lista uten den.
      const fb = await sb
        .from("staff")
        .select("id, employee_number, full_name, title, bio, photo_url, contract_url, active, email, postnummer, profile_id, pin_hash, level_id")
        .order("employee_number");
      data = (fb.data ?? []) as unknown as typeof data;
      error = fb.error;
    }
    return (data ?? []).map((r) => {
      const { pin_hash, ...rest } = r as Record<string, unknown>;
      return { ...rest, has_pin: pin_hash != null } as AdminStaff;
    });
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

export type CustomerPage = {
  rows: AdminCustomer[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Paginert + søkbart kundekartotek. Skalerer til tusenvis av kunder
 * (unngår PostgREST sin 1000-rads-grense ved å hente én side om gangen).
 */
export async function getCustomersPage(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<CustomerPage> {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  try {
    const sb = await createClient();
    let query = sb
      .from("customers")
      .select(
        "id, full_name, phone, email, category, bookings(status, price_nok, start_at)",
        { count: "exact" },
      )
      .order("full_name")
      .range(from, to);

    const q = (opts.q ?? "").trim();
    if (q) {
      // Fjern tegn som ville brutt or/ilike-filteret.
      const esc = q.replace(/[%,()]/g, " ");
      query = query.or(
        `full_name.ilike.%${esc}%,phone.ilike.%${esc}%,email.ilike.%${esc}%`,
      );
    }

    const { data, count } = await query;
    const rows = (data ?? []).map((r) => {
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
    return { rows, total: count ?? rows.length, page, pageSize };
  } catch {
    return { rows: [], total: 0, page, pageSize };
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

export type StaffWebOrderRow = {
  id: string;
  name: string;
  title: string | null;
  photo: string | null;
  sortOrder: number | null;
};

/** Aktive ansatte i nettside-rekkefølgen (admin → Ansatte → Rekkefølge). */
export async function getStaffWebOrder(): Promise<{ rows: StaffWebOrderRow[]; ready: boolean }> {
  try {
    const sb = await createClient();
    const first = await sb
      .from("staff")
      .select("id, full_name, display_name, title, photo_url, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("employee_number");
    let data = first.data as Record<string, unknown>[] | null;
    let ready = !first.error;
    if (first.error) {
      const fb = await sb
        .from("staff")
        .select("id, full_name, title, photo_url")
        .eq("active", true)
        .order("employee_number");
      data = fb.data as Record<string, unknown>[] | null;
      ready = false;
    }
    return {
      ready,
      rows: (data ?? []).map((r) => ({
        id: r.id as string,
        name: ((r.display_name as string | null) ?? "").trim() || (r.full_name as string),
        title: (r.title as string | null) ?? null,
        photo: (r.photo_url as string | null) ?? null,
        sortOrder: (r.sort_order as number | null) ?? null,
      })),
    };
  } catch {
    return { rows: [], ready: false };
  }
}
