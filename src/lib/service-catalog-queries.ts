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
 * Offentlig liste for booking-flyten: tjeneste-navn → barber-navn som IKKE
 * leverer tjenesten. Booking-veiviseren filtrerer barber-lista på dette.
 *
 * Kilden er nå den POSITIVE tjeneste-tilknytningen (staff_services, via
 * service_non_providers_public): en ansatt uten rader leverer alt, ellers kun
 * tjenestene de har rad for. Vi returnerer «ikke-leverandørene» slik at
 * booking-filteret (som filtrerer bort ekskluderte) er uendret.
 */
export async function getPublicServiceExclusions(): Promise<
  Record<string, string[]>
> {
  const out: Record<string, string[]> = {};
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("service_non_providers_public");
    for (const r of (data ?? []) as {
      service_name: string;
      barber_name: string;
    }[]) {
      (out[r.service_name] ??= []).push(r.barber_name);
    }
  } catch {
    // tomt → ingen filtrering (alle barbere vises)
  }
  return out;
}

/**
 * Offentlig nivåpris-matrise for booking-visning: tjenestenavn → nivå-slug →
 * pris (kun satte nivåpriser). Booking viser riktig pris når barber (nivå) er
 * valgt; ellers basisprisen.
 */
export async function getPublicLevelPrices(): Promise<
  Record<string, Record<string, number>>
> {
  const out: Record<string, Record<string, number>> = {};
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("service_level_prices_public");
    for (const r of (data ?? []) as {
      service_name: string;
      level_slug: string;
      price_nok: number;
    }[]) {
      (out[r.service_name] ??= {})[r.level_slug] = Number(r.price_nok) || 0;
    }
  } catch {
    // tomt → kun basispris
  }
  return out;
}

/** Offentlig oppslag: barber-navn → nivå-slug (for prisvisning i booking). */
export async function getPublicBarberLevels(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("staff_levels_public");
    for (const r of (data ?? []) as {
      barber_name: string;
      level_slug: string;
    }[]) {
      out[r.barber_name] = r.level_slug;
    }
  } catch {
    // tomt → ingen nivå
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
