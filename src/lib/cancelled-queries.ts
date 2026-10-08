import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * AVBESTILTE TIMER – oversikt (kun server, admin/shop via RLS).
 *   En avbestilling er en myk sletting: booking-raden beholdes med
 *   status = 'cancelled', så ALL historikk siden lansering finnes. Vi
 *   henter dem nyeste avbestilling først.
 *
 *   cancelled_at / cancelled_by stemples av trigger (se
 *   KJØR-I-SUPABASE-AVBESTILLINGER.sql). Historiske rader (før den ble
 *   kjørt) har null i begge → vises som «ukjent» i oversikten.
 * ===================================================================== */

export type CancelledBy = "customer" | "staff" | null;

export type CancelledBooking = {
  id: string;
  /** Når timen skulle vært (ISO). */
  startAt: string;
  /** Når bookingen opprinnelig ble booket (ISO). */
  bookedAt: string;
  /** Når den ble avbestilt (ISO) – null for historiske rader. */
  cancelledAt: string | null;
  /** Hvem avbestilte – 'customer' | 'staff' | null (ukjent). */
  cancelledBy: CancelledBy;
  customer: string | null;
  barber: string | null;
  service: string | null;
};

type Row = {
  id: string;
  start_at: string;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  person_label: string | null;
  customers: { full_name: string | null } | null;
  staff: { full_name: string | null } | null;
  services: { name: string | null } | null;
};

/** Alle avbestilte timer, nyeste avbestilling først (så eldste time). */
export async function getCancelledBookings(
  limit = 500,
): Promise<CancelledBooking[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("bookings")
      .select(
        "id, start_at, created_at, cancelled_at, cancelled_by, person_label, customers(full_name), staff(full_name), services(name)",
      )
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false, nullsFirst: false })
      .order("start_at", { ascending: false })
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      startAt: r.start_at,
      bookedAt: r.created_at,
      cancelledAt: r.cancelled_at,
      cancelledBy:
        r.cancelled_by === "customer" || r.cancelled_by === "staff"
          ? r.cancelled_by
          : null,
      customer: r.customers?.full_name ?? r.person_label ?? null,
      barber: r.staff?.full_name ?? null,
      service: r.services?.name ?? null,
    }));
  } catch {
    return [];
  }
}
