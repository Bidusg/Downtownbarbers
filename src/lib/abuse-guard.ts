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
 * aktive bookinger. Tolerant: feiler oppslaget, logges det og bookingen
 * slippes gjennom (fail open) – en databasefeil skal ikke stenge alle
 * ekte kunder ute; selve bookingen feiler uansett hvis databasen er nede.
 */
export async function customerBookingLimited(
  email: string | null | undefined,
  phone: string | null | undefined,
): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const e = (email ?? "").trim().toLowerCase();
    const digits = (phone ?? "").replace(/\D/g, "");
    const p = digits.slice(-8);
    if (!e && p.length < 8) return false;

    // Egne spørringer (ingen verdier limt inn i en .or()-streng, så
    // komma/parenteser i input kan ikke endre filteret).
    const ids = new Set<string>();
    if (e) {
      const esc = e.replace(/[%_\\]/g, "\\$&");
      const { data, error } = await svc.from("customers").select("id").ilike("email", esc).limit(10);
      if (error) {
        console.error("customerBookingLimited (e-post):", error.message);
        return false;
      }
      for (const c of data ?? []) ids.add(c.id as string);
    }
    if (p.length >= 8) {
      const { data, error } = await svc.from("customers").select("id").ilike("phone", `%${p}%`).limit(10);
      if (error) {
        console.error("customerBookingLimited (telefon):", error.message);
        return false;
      }
      for (const c of data ?? []) ids.add(c.id as string);
    }
    if (ids.size === 0) return false;
    const { count, error } = await svc
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("customer_id", [...ids])
      .in("status", ["pending", "confirmed"])
      .gte("start_at", new Date().toISOString());
    if (error) {
      console.error("customerBookingLimited (bookinger):", error.message);
      return false;
    }
    return (count ?? 0) >= CUSTOMER_OPEN_LIMIT;
  } catch (err) {
    console.error("customerBookingLimited:", err instanceof Error ? err.message : err);
    return false;
  }
}
