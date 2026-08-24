import { createClient } from "@/lib/supabase/server";
import { todayShop as mockShop } from "@/lib/data/mock";

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
