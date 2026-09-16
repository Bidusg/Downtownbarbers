import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * MARKEDSFØRING – query-lag (samtykke-først)
 *   Henter samtykke-statistikk og mottakerlister per segment. Kun kunder
 *   med marketing_consent = true OG e-post er med.
 * ===================================================================== */

export type ConsentStats = {
  total: number;
  consenting: number;
  reachable: number; // samtykke + e-post
  smsReachable: number; // samtykke + telefon
};

export async function getConsentStats(): Promise<ConsentStats> {
  try {
    const sb = await createClient();
    const [totalRes, consentRes, reachRes, smsRes] = await Promise.all([
      sb.from("customers").select("*", { count: "exact", head: true }),
      sb.from("customers").select("*", { count: "exact", head: true })
        .eq("marketing_consent", true),
      sb.from("customers").select("*", { count: "exact", head: true })
        .eq("marketing_consent", true).not("email", "is", null),
      sb.from("customers").select("*", { count: "exact", head: true })
        .eq("marketing_consent", true).not("phone", "is", null),
    ]);
    return {
      total: totalRes.count ?? 0,
      consenting: consentRes.count ?? 0,
      reachable: reachRes.count ?? 0,
      smsReachable: smsRes.count ?? 0,
    };
  } catch {
    return { total: 0, consenting: 0, reachable: 0, smsReachable: 0 };
  }
}

export type Segment = "all" | "gullkunder" | "inaktiv";

export const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: "all", label: "Alle med samtykke", hint: "Alle som har sagt ja" },
  { key: "gullkunder", label: "Gullkunder", hint: "Topp 20 etter forbruk" },
  { key: "inaktiv", label: "Inaktive", hint: "Ikke besøkt på 90+ dager" },
];

export type Recipient = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  token: string | null;
};

export type Channel = "email" | "sms";

export async function getMarketingRecipients(
  segment: Segment,
  channel: Channel = "email",
): Promise<Recipient[]> {
  try {
    const sb = await createClient();
    const q = sb
      .from("customers")
      .select("id, full_name, email, phone, portal_token")
      .eq("marketing_consent", true)
      .not(channel === "sms" ? "phone" : "email", "is", null)
      .limit(100000);
    const { data: custs } = await q;
    const base: Recipient[] = (custs ?? [])
      .filter((c) =>
        channel === "sms"
          ? (c.phone as string)?.trim()
          : (c.email as string)?.trim(),
      )
      .map((c) => ({
        id: c.id as string,
        name: (c.full_name as string) ?? "",
        email: ((c.email as string) ?? "").trim(),
        phone: (c.phone as string) ?? null,
        token: (c.portal_token as string) ?? null,
      }));

    if (segment === "all" || base.length === 0) return base;

    const ids = new Set(base.map((r) => r.id));

    if (segment === "gullkunder") {
      const { data: sales } = await sb
        .from("sales")
        .select("customer_id, total_nok")
        .not("customer_id", "is", null)
        .limit(100000);
      const spend = new Map<string, number>();
      for (const s of sales ?? []) {
        const cid = s.customer_id as string;
        if (ids.has(cid)) spend.set(cid, (spend.get(cid) ?? 0) + (Number(s.total_nok) || 0));
      }
      return base
        .map((r) => ({ r, s: spend.get(r.id) ?? 0 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 20)
        .map((x) => x.r);
    }

    // inaktiv: siste fullførte besøk eldre enn 90 dager (eller aldri)
    const { data: bookings } = await sb
      .from("bookings")
      .select("customer_id, start_at, status")
      .eq("status", "completed")
      .not("customer_id", "is", null)
      .limit(100000);
    const lastVisit = new Map<string, number>();
    for (const b of bookings ?? []) {
      const cid = b.customer_id as string;
      if (!ids.has(cid)) continue;
      const t = new Date(b.start_at as string).getTime();
      if (!lastVisit.has(cid) || t > (lastVisit.get(cid) as number)) lastVisit.set(cid, t);
    }
    const cutoff = Date.now() - 90 * 86400000;
    return base.filter((r) => (lastVisit.get(r.id) ?? 0) < cutoff);
  } catch {
    return [];
  }
}

export type MarketingSend = {
  id: string;
  subject: string;
  segment: string | null;
  recipient_count: number;
  created_at: string;
};

export async function getMarketingSends(limit = 20): Promise<MarketingSend[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("marketing_sends")
      .select("id, subject, segment, recipient_count, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data as MarketingSend[]) ?? [];
  } catch {
    return [];
  }
}

/** Feiltolerant enkeltoppslag av samtykke (så kundekortet ikke brytes før migrasjon). */
export async function getCustomerConsent(id: string): Promise<boolean> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("customers")
      .select("marketing_consent")
      .eq("id", id)
      .maybeSingle();
    return Boolean((data as { marketing_consent?: boolean } | null)?.marketing_consent);
  } catch {
    return false;
  }
}

/* ---------------- Innkommende SMS (STOPP/START) — 0027 ---------------- */

export type InboundMsg = {
  id: string;
  from_phone: string;
  body: string | null;
  action: "stop" | "start" | "other";
  matched: number;
  created_at: string;
};

/** Nylige innkommende SMS-svar (STOPP/START). Admin, via RPC (security definer). */
export async function getRecentInbound(limit = 15): Promise<InboundMsg[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("sms_inbound_recent", { p_limit: limit });
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      from_phone: String(r.from_phone ?? ""),
      body: (r.body as string) ?? null,
      action: (r.action as "stop" | "start" | "other") ?? "other",
      matched: Number(r.matched ?? 0),
      created_at: String(r.created_at),
    }));
  } catch {
    return [];
  }
}
