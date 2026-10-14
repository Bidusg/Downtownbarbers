import { createClient } from "@/lib/supabase/server";

/* =====================================================================
 * Query-lag for driftsmeldinger / interne varsler (0032).
 * Alt degraderer til tomt ved feil.
 * ===================================================================== */

export type NoticeLevel = "info" | "warning" | "critical";
export type NoticeAudience = "all" | "admin" | "shop" | "ansatt";

export type Notice = {
  id: string;
  title: string;
  body: string | null;
  level: NoticeLevel;
  audience: NoticeAudience;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
};

function normalize(r: Record<string, unknown>): Notice {
  return {
    id: r.id as string,
    title: r.title as string,
    body: (r.body as string) ?? null,
    level: (r.level as NoticeLevel) ?? "info",
    audience: (r.audience as NoticeAudience) ?? "all",
    active: Boolean(r.active),
    starts_at: (r.starts_at as string) ?? null,
    ends_at: (r.ends_at as string) ?? null,
    created_by: (r.created_by as string) ?? null,
    created_at: r.created_at as string,
  };
}

/** Alle meldinger, nyeste først (admin-liste). */
export async function getNotices(): Promise<Notice[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("notices")
      .select(
        "id, title, body, level, audience, active, starts_at, ends_at, created_by, created_at",
      )
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

/**
 * Aktive meldinger for en gitt målgruppe: active = true, audience matcher
 * ('all' eller lik param), og nå er innenfor [starts_at, ends_at]
 * (null = åpen ende). Defensivt tomt ved feil.
 */
export async function getActiveNotices(
  audience: "admin" | "shop" | "ansatt",
): Promise<Notice[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("notices")
      .select(
        "id, title, body, level, audience, active, starts_at, ends_at, created_by, created_at",
      )
      .eq("active", true)
      .in("audience", ["all", audience])
      .order("created_at", { ascending: false });
    // Tidsvinduet (fra/til) sjekkes her i stedet for med to .or()-filtre i
    // spørringen – enklere og uten tvil om hvordan filtrene kombineres.
    const now = Date.now();
    return (data ?? [])
      .map((r) => normalize(r as Record<string, unknown>))
      .filter(
        (n) =>
          (!n.starts_at || new Date(n.starts_at).getTime() <= now) &&
          (!n.ends_at || new Date(n.ends_at).getTime() >= now),
      );
  } catch {
    return [];
  }
}
