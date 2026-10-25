"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCustomerToken } from "@/lib/customer-session";
import { sendCrisisAlert, sendCrisisReceipt } from "@/lib/email";
import { getSiteSettings } from "@/lib/site-settings";
import { siteUrl } from "@/lib/site-url";

/* =====================================================================
 * KRISETIME (kundeklubb-nivåer med «krisetime», f.eks. Platinum)
 *   Kunden er innlogget og finner ingen tid som passer. Forespørselen
 *   lagres (crisis_requests), vises øverst i kassa, og salongen får e-post.
 *   Databasen sjekker nivået og maks 2 forespørsler per døgn.
 * ===================================================================== */

const CONTACT_INBOX = "contact@downtownbarbers.no";

const DAY: Record<string, string> = { i_dag: "I dag", i_morgen: "I morgen" };
const TIME: Record<string, string> = {
  nar_som_helst: "når som helst",
  formiddag: "formiddag",
  ettermiddag: "ettermiddag",
  kveld: "kveld",
};

export type CrisisResult = { ok?: true; error?: "login" | "not_allowed" | "too_many" | "server" };

export async function requestCrisisTime(input: {
  service: string;
  day: string;
  time: string;
  note?: string;
}): Promise<CrisisResult> {
  const token = await getCustomerToken();
  if (!token) return { error: "login" };
  const sb = await createClient();
  const { data: id, error } = await sb.rpc("request_crisis_time", {
    p_token: token,
    p_service: (input.service ?? "").slice(0, 200),
    p_day: input.day,
    p_time: input.time,
    p_note: (input.note ?? "").slice(0, 500),
  });
  if (error) {
    if (/NOT_ALLOWED/.test(error.message)) return { error: "not_allowed" };
    if (/TOO_MANY/.test(error.message)) return { error: "too_many" };
    if (/NOT_LOGGED_IN/.test(error.message)) return { error: "login" };
    return { error: "server" };
  }

  // Varsle salongen (best-effort – forespørselen er allerede lagret).
  try {
    const svc = createServiceClient();
    const { data: r } = await svc
      .from("crisis_requests")
      .select("name, phone, email, tier, service, wish_day, wish_time, note")
      .eq("id", id as string)
      .maybeSingle();
    const { data: cfg } = await svc.from("settings").select("value").eq("key", "booking_notify").maybeSingle();
    const v = (cfg?.value ?? null) as { email?: string } | null;
    const extra = v?.email?.trim() || (await getSiteSettings()).email?.trim() || "";
    const to = Array.from(new Set([CONTACT_INBOX, extra].map((x) => x.toLowerCase()).filter((x) => x.includes("@"))));
    if (r) {
      for (const addr of to) {
        await sendCrisisAlert({
          to: addr,
          name: String(r.name ?? "Kunde"),
          phone: (r.phone as string | null) ?? null,
          email: (r.email as string | null) ?? null,
          tier: (r.tier as string | null) ?? null,
          service: String(r.service ?? ""),
          when: `${DAY[String(r.wish_day)] ?? "I dag"}, ${TIME[String(r.wish_time)] ?? "når som helst"}`,
          note: (r.note as string | null) ?? null,
          kasseUrl: `${siteUrl()}/kasse/krisetimer`,
        });
      }
      // Kvittering til kunden.
      const custEmail = (r.email as string | null)?.trim();
      if (custEmail) {
        await sendCrisisReceipt({
          to: custEmail,
          name: String(r.name ?? ""),
          service: String(r.service ?? ""),
          when: `${DAY[String(r.wish_day)] ?? "I dag"}, ${TIME[String(r.wish_time)] ?? "når som helst"}`,
        });
      }
    }
  } catch {
    /* e-post skal aldri stoppe forespørselen */
  }
  return { ok: true };
}
