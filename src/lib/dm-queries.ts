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
    // PostgREST leverer maks 1000 rader per kall – hent i sider, ellers
    // stopper lista på 1000 selv om 6 000 har samtykke.
    const custs: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .from("customers")
        .select("id, full_name, email, phone, portal_token")
        .eq("marketing_consent", true)
        .not(channel === "sms" ? "phone" : "email", "is", null)
        .order("id")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      custs.push(...(data as Record<string, unknown>[]));
      if (data.length < 1000) break;
    }
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
  recipient_count: number; // sendt så langt
  created_at: string;
  status?: string; // queued | sending | done | failed
  total?: number;
  failed?: number;
  channel?: string;
  last_error?: string | null;
  updated_at?: string | null;
};

export async function getMarketingSends(limit = 20): Promise<MarketingSend[]> {
  try {
    const sb = await createClient();
    // Tål at nyeste kolonner (updated_at) ikke er migrert ennå.
    const full = await sb
      .from("marketing_sends")
      .select("id, subject, segment, recipient_count, created_at, status, total, failed, channel, last_error, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!full.error) return (full.data as MarketingSend[]) ?? [];
    const { data } = await sb
      .from("marketing_sends")
      .select("id, subject, segment, recipient_count, created_at, status, total, failed, channel, last_error")
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

/**
 * Status for «send til resten» per utsending i loggen.
 *   rest   = hvor mange i segmentet (med samtykke + e-post) som ennå IKKE har
 *            fått en e-post med samme emne (ifølge køen, status «sent»).
 *   latest = er dette den nyeste utsendingen med dette emnet? Bare den viser
 *            knappen/statusen, så eldre rader med samme emne ikke maser.
 * Bare køen telles (rask, ingen kall til Resend). Utsendinger fra før køen
 * fantes kan derfor vise noen for mange igjen – forhåndsvisningen i
 * «Send til resten» sjekker også Resend-loggen og har siste ord.
 */
export async function getRestStatus(
  sends: MarketingSend[],
): Promise<Record<string, { rest: number; latest: boolean }>> {
  const out: Record<string, { rest: number; latest: boolean }> = {};
  try {
    const sb = await createClient();
    const emailSends = sends.filter((s) => (s.channel ?? "email") !== "sms" && (s.status === "done" || !s.status));
    // Nyeste først (lista er allerede sortert synkende på created_at).
    const seenSubject = new Set<string>();
    const groups = new Map<string, MarketingSend[]>();
    for (const s of emailSends) {
      const key = `${s.subject}\u0000${s.segment ?? "all"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const recipientCache = new Map<string, Recipient[]>();
    for (const [key, list] of groups) {
      const [subject, segment] = key.split("\u0000");
      // «filter»-utsendinger har ikke et segment vi kan regne om. «Resten» =
      // denne utsendingens egne køede mottakere som ennå ikke er sendt.
      if (segment === "filter") {
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          const { count: total } = await sb
            .from("marketing_queue")
            .select("id", { count: "exact", head: true })
            .eq("send_id", s.id);
          const { count: done } = await sb
            .from("marketing_queue")
            .select("id", { count: "exact", head: true })
            .eq("send_id", s.id)
            .eq("status", "sent");
          out[s.id] = {
            rest: Math.max(0, (total ?? 0) - (done ?? 0)),
            latest: i === 0 && !seenSubject.has(subject),
          };
        }
        seenSubject.add(subject);
        continue;
      }
      // Alle utsendinger med samme emne (også eldre enn de 20 i loggen).
      const { data: same } = await sb.from("marketing_sends").select("id").eq("subject", subject);
      const ids = (same ?? []).map((x) => x.id as string);
      const sent = new Set<string>();
      for (let from = 0; ids.length; from += 1000) {
        const { data } = await sb
          .from("marketing_queue")
          .select("email")
          .in("send_id", ids)
          .eq("status", "sent")
          .range(from, from + 999);
        for (const r of data ?? []) if (r.email) sent.add(String(r.email).trim().toLowerCase());
        if (!data || data.length < 1000) break;
      }
      if (!recipientCache.has(segment)) {
        recipientCache.set(
          segment,
          (await getMarketingRecipients(segment as Segment, "email")).filter((r) => r.token),
        );
      }
      const all = recipientCache.get(segment)!;
      const rest = all.filter((r) => !sent.has(r.email.trim().toLowerCase())).length;
      list.forEach((s, i) => {
        const latest = i === 0 && !seenSubject.has(subject);
        out[s.id] = { rest, latest };
      });
      seenSubject.add(subject);
    }
  } catch {
    /* uten status vises knappen som før */
  }
  return out;
}
