import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

/* =====================================================================
 * MISBRUKSVERN for det offentlige bookingskjemaet.
 *
 *  1. Honeypot – et skjult felt («website») som ekte kunder aldri ser.
 *     Er det fylt ut, er det en robot: vi svarer «ok» uten å lagre noe,
 *     så roboten ikke lærer at den ble avslørt.
 *  2. IP-takt – maks N innsendinger per IP per time. Minnebasert per
 *     serverinstans (beste-innsats; Vercel kan kjøre flere instanser), så
 *     den stopper enkle løkker, ikke distribuerte angrep.
 *  3. Kunde-takt – maks M KOMMENDE, aktive bookinger per e-post/telefon.
 *     Databasebasert og dermed robust: én person kan ikke fylle kalenderen
 *     med 40 timer, uansett hvor mange IP-er som brukes.
 *
 *  Alle grensene er romslige for ekte kunder (en familie som booker fire
 *  personer treffer ingen av dem).
 * ===================================================================== */

const IP_LIMIT = 12; // innsendinger per IP per vindu
const IP_WINDOW_MS = 60 * 60 * 1000;
const CUSTOMER_OPEN_LIMIT = 8; // kommende aktive bookinger per kunde

const ipHits = new Map<string, number[]>();

/** Klient-IP fra Vercel/proxy-headere (første i x-forwarded-for). */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for") ?? "";
    const first = xff.split(",")[0]?.trim();
    return first || h.get("x-real-ip") || "ukjent";
  } catch {
    return "ukjent";
  }
}

/** true = for mange innsendinger fra denne IP-en i vinduet. */
export async function ipRateLimited(): Promise<boolean> {
  const ip = await clientIp();
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  // Enkel opprydding så kartet ikke vokser uendelig.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (!v.some((t) => now - t < IP_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return hits.length > IP_LIMIT;
}

/** Honeypot: utfylt felt = robot. */
export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * true = kunden (e-post ELLER telefon) har allerede for mange kommende,
 * aktive bookinger. Tolerant: feiler oppslaget, slippes bookingen gjennom.
 */
export async function customerBookingLimited(
  email: string | null | undefined,
  phone: string | null | undefined,
): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const ors: string[] = [];
    const e = (email ?? "").trim().toLowerCase();
    const p = (phone ?? "").replace(/\s/g, "");
    if (e) ors.push(`email.ilike.${e}`);
    if (p) ors.push(`phone.ilike.*${p.slice(-8)}*`);
    if (ors.length === 0) return false;
    const { data: customers } = await svc
      .from("customers")
      .select("id")
      .or(ors.join(","))
      .limit(10);
    const ids = (customers ?? []).map((c) => c.id as string);
    if (ids.length === 0) return false;
    const { count } = await svc
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("customer_id", ids)
      .in("status", ["pending", "confirmed"])
      .gte("start_at", new Date().toISOString());
    return (count ?? 0) >= CUSTOMER_OPEN_LIMIT;
  } catch {
    return false;
  }
}
