import { createClient } from "@/lib/supabase/server";
import { todayShop as mockShop } from "@/lib/data/mock";

export type TodayBooking = {
  id: string;
  time: string;
  customer: string;
  customerId: string | null;
  customerEmail: string | null;
  service: string;
  barber: string;
  price: number;
  status: string;
};

/** Dagens bookinger med id-er (for kassen: fullføre + registrere salg). */
export async function getTodayBookings(): Promise<TodayBooking[]> {
  try {
    const sb = await createClient();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { data } = await sb
      .from("bookings")
      .select(
        "id, start_at, status, price_nok, customers(id, full_name, email), services(name), staff(full_name)",
      )
      .gte("start_at", start.toISOString())
      .lt("start_at", end.toISOString())
      .order("start_at", { ascending: true });
    return (data ?? []).map((b) => {
      const c = b.customers as {
        id?: string;
        full_name?: string;
        email?: string;
      } | null;
      const s = b.services as { name?: string } | null;
      const st = b.staff as { full_name?: string } | null;
      let time = "";
      try {
        time = new Date(b.start_at).toLocaleTimeString("nb-NO", {
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {}
      return {
        id: b.id,
        time,
        customer: c?.full_name ?? "—",
        customerId: c?.id ?? null,
        customerEmail: c?.email ?? null,
        service: s?.name ?? "—",
        barber: st?.full_name ?? "—",
        price: b.price_nok,
        status: b.status,
      };
    });
  } catch {
    return [];
  }
}

/* ===================== EKTE OMSETNING (fra sales) ===================== */

export type RevPoint = { day: string; nok: number };

const osloDayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }); // yyyy-mm-dd
const osloMonthKey = (iso: string) => osloDayKey(iso).slice(0, 7); // yyyy-mm

/** Omsetningsserie: siste 14 dager (period="days") eller 12 mnd (period="months"). */
export async function getRevenueSeries(
  period: "days" | "months",
): Promise<RevPoint[]> {
  const now = new Date();
  const buckets: { key: string; day: string }[] = [];
  if (period === "days") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
      buckets.push({
        key,
        day: d.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit" }),
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({
        key,
        day: d.toLocaleDateString("nb-NO", { month: "short" }),
      });
    }
  }
  try {
    const sb = await createClient();
    const startKey = buckets[0].key;
    const startIso =
      period === "days"
        ? new Date(startKey + "T00:00:00Z").toISOString()
        : new Date(startKey + "-01T00:00:00Z").toISOString();
    const { data } = await sb
      .from("sales")
      .select("total_nok, sold_at")
      .gte("sold_at", startIso);
    const sums = new Map<string, number>(buckets.map((b) => [b.key, 0]));
    for (const s of data ?? []) {
      const key =
        period === "days" ? osloDayKey(s.sold_at) : osloMonthKey(s.sold_at);
      if (sums.has(key))
        sums.set(key, (sums.get(key) ?? 0) + (Number(s.total_nok) || 0));
    }
    return buckets.map((b) => ({ day: b.day, nok: Math.round(sums.get(b.key) ?? 0) }));
  } catch {
    return buckets.map((b) => ({ day: b.day, nok: 0 }));
  }
}

export type RevenueSummary = {
  today: number;
  month: number;
  saleCount: number;
  avgPerSale: number;
  perBarber: { name: string; nok: number }[];
  hasData: boolean;
};

/** Nøkkeltall for dashboard/regnskap fra ekte salg. */
export async function getRevenueSummary(): Promise<RevenueSummary> {
  const empty: RevenueSummary = {
    today: 0,
    month: 0,
    saleCount: 0,
    avgPerSale: 0,
    perBarber: [],
    hasData: false,
  };
  try {
    const sb = await createClient();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data } = await sb
      .from("sales")
      .select("total_nok, sold_at, staff(full_name)")
      .gte("sold_at", monthStart);
    const rows = data ?? [];
    if (rows.length === 0) return empty;

    const todayKey = now.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
    let today = 0;
    let month = 0;
    const perBarber = new Map<string, number>();
    for (const s of rows) {
      const amt = Number(s.total_nok) || 0;
      month += amt;
      if (osloDayKey(s.sold_at) === todayKey) today += amt;
      const st = s.staff as { full_name?: string } | null;
      const name = st?.full_name ?? "Ukjent";
      perBarber.set(name, (perBarber.get(name) ?? 0) + amt);
    }
    return {
      today: Math.round(today),
      month: Math.round(month),
      saleCount: rows.length,
      avgPerSale: Math.round(month / rows.length),
      perBarber: Array.from(perBarber, ([name, nok]) => ({
        name,
        nok: Math.round(nok),
      })).sort((a, b) => b.nok - a.nok),
      hasData: true,
    };
  } catch {
    return empty;
  }
}

/** Dagens salg fordelt på betalingsmåte – auto-grunnlag for kasseoppgjør. */
export async function getSalesByMethodToday(): Promise<
  { method: string; nok: number; count: number }[]
> {
  try {
    const sb = await createClient();
    const now = new Date();
    const start = new Date(
      now.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }) + "T00:00:00Z",
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const { data } = await sb
      .from("sales")
      .select("total_nok, payment_method")
      .gte("sold_at", start.toISOString())
      .lt("sold_at", end.toISOString());
    const map = new Map<string, { nok: number; count: number }>();
    for (const s of data ?? []) {
      const m = (s.payment_method as string) || "Ukjent";
      const cur = map.get(m) ?? { nok: 0, count: 0 };
      cur.nok += Number(s.total_nok) || 0;
      cur.count += 1;
      map.set(m, cur);
    }
    return Array.from(map, ([method, v]) => ({
      method,
      nok: Math.round(v.nok),
      count: v.count,
    })).sort((a, b) => b.nok - a.nok);
  } catch {
    return [];
  }
}

export type ShopToday = {
  customersServed: number;
  customersTarget: number;
  nextUp: { time: string; customer: string; service: string; barber: string }[];
  live: boolean;
};

function hhmm(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Dagens shop-fremdrift fra ekte bookinger; fallback til testdata. */
export async function getShopToday(): Promise<ShopToday> {
  try {
    const sb = await createClient();
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data, error } = await sb
      .from("bookings")
      .select(
        "start_at, status, customers(full_name), services(name), staff(full_name)",
      )
      .gte("start_at", start.toISOString())
      .lt("start_at", end.toISOString())
      .order("start_at", { ascending: true });

    if (error || !data) throw error ?? new Error("no data");

    const served = data.filter(
      (b) => b.status === "completed",
    ).length;

    // Dagsmål fra daily_targets (kundeantall), ellers standard 20
    const { data: tgt } = await sb
      .from("daily_targets")
      .select("target_value, metric")
      .eq("target_date", start.toISOString().slice(0, 10))
      .maybeSingle();
    const target = tgt?.target_value ? Number(tgt.target_value) : 20;

    const nextUp = data
      .filter((b) => new Date(b.start_at) >= now && b.status !== "cancelled")
      .slice(0, 6)
      .map((b) => {
        const c = b.customers as { full_name?: string } | null;
        const s = b.services as { name?: string } | null;
        const st = b.staff as { full_name?: string } | null;
        return {
          time: hhmm(b.start_at),
          customer: c?.full_name ?? "—",
          service: s?.name ?? "—",
          barber: st?.full_name ?? "—",
        };
      });

    return {
      customersServed: served,
      customersTarget: target,
      nextUp,
      live: true,
    };
  } catch {
    return {
      customersServed: mockShop.customersServed,
      customersTarget: mockShop.customersTarget,
      nextUp: mockShop.nextUp,
      live: false,
    };
  }
}
