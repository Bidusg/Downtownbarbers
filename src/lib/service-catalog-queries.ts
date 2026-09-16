import { createClient } from "@/lib/supabase/server";

/**
 * Tjeneste-katalog-spørringer (0031): popularitet, behandlingsunntak og
 * offentlig unntaksliste. Holdt utenfor queries.ts for å holde den ryddig.
 */

/**
 * Popularitet = antall FULLFØRTE bookinger per tjeneste siste `days` dager.
 * Returnerer et oppslag service_id → antall. Bruker RPC (security definer) så
 * også den offentlige booking-siden kan lese uten tilgang til rå bookings.
 */
export async function getServicePopularity(
  days = 90,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("service_popularity", { p_days: days });
    for (const r of (data ?? []) as {
      service_id: string;
      completed_count: number;
    }[]) {
      map.set(r.service_id, Number(r.completed_count) || 0);
    }
  } catch {
    // tomt oppslag → popularitet 0 for alle (ingen regresjon)
  }
  return map;
}

/**
 * Offentlig unntaksliste for booking-flyten: tjeneste-navn → liste med
 * barber-navn som IKKE utfører tjenesten. Booking-veiviseren filtrerer
 * barber-lista på dette. Navn brukes som nøkkel fordi hele booking-flyten
 * (createBooking, available_slots) allerede identifiserer med navn.
 */
export async function getPublicServiceExclusions(): Promise<
  Record<string, string[]>
> {
  const out: Record<string, string[]> = {};
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("service_exclusions_public");
    for (const r of (data ?? []) as {
      service_name: string;
      barber_name: string;
    }[]) {
      (out[r.service_name] ??= []).push(r.barber_name);
    }
  } catch {
    // tomt → ingen unntak (alle barbere vises, som før)
  }
  return out;
}

/**
 * Admin-oppslag: service_id → liste med staff_id som er ekskludert.
 * Krever admin/shop-lesetilgang (RLS). Brukes i tjenester-admin.
 */
export async function getServiceExclusionsAdmin(): Promise<
  Record<string, string[]>
> {
  const out: Record<string, string[]> = {};
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff_service_exclusions")
      .select("staff_id, service_id");
    for (const r of (data ?? []) as {
      staff_id: string;
      service_id: string;
    }[]) {
      (out[r.service_id] ??= []).push(r.staff_id);
    }
  } catch {
    // tomt
  }
  return out;
}

export type ExclusionStaff = { id: string; full_name: string };

/** Aktive barbere (id + navn) for unntaks-UI i admin. */
export async function getActiveStaffForExclusions(): Promise<ExclusionStaff[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("id, full_name")
      .eq("active", true)
      .order("employee_number");
    return (data as ExclusionStaff[]) ?? [];
  } catch {
    return [];
  }
}
