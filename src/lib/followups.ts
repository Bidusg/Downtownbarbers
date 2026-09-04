import { createClient } from "@/lib/supabase/server";
import { generateFollowupCopy } from "@/lib/ai";
import { sendFollowupEmail } from "@/lib/email";

export type DueFollowup = {
  customer_id: string;
  full_name: string;
  email: string | null;
  last_service: string | null;
  last_barber: string | null;
  last_visit: string;
  weeks_since: number;
};

/** Henter kunder som er klare for oppfølging (uten å sende noe). */
export async function getDueFollowups(weeks = 6): Promise<DueFollowup[]> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("due_followups", { p_weeks: weeks });
    return (data ?? []) as DueFollowup[];
  } catch {
    return [];
  }
}

/**
 * Kjører oppfølging: finner modne kunder, genererer AI-tekst, sender e-post
 * og logger sendingen. Idempotent via followups-loggen (ingen dobbeltsending).
 */
export async function runFollowups(opts?: {
  weeks?: number;
  limit?: number;
}): Promise<{ ok: boolean; due: number; emailed: number; error?: string }> {
  const weeks = opts?.weeks ?? 6;
  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("due_followups", { p_weeks: weeks });
    if (error) return { ok: false, due: 0, emailed: 0, error: error.message };

    let rows = (data ?? []) as DueFollowup[];
    if (opts?.limit && opts.limit > 0) rows = rows.slice(0, opts.limit);

    let emailed = 0;
    for (const r of rows) {
      if (!r.email) continue;
      const copy = await generateFollowupCopy({
        name: r.full_name,
        service: r.last_service,
        weeksSince: r.weeks_since,
      });
      const ok = await sendFollowupEmail({
        to: r.email,
        name: r.full_name,
        subject: copy.subject,
        intro: copy.intro,
      });
      if (ok) {
        emailed++;
        await sb.rpc("mark_followup_sent", {
          p_customer: r.customer_id,
          p_kind: "rebooking",
        });
      }
    }
    return { ok: true, due: rows.length, emailed };
  } catch (e) {
    return {
      ok: false,
      due: 0,
      emailed: 0,
      error: e instanceof Error ? e.message : "unknown",
    };
  }
}
