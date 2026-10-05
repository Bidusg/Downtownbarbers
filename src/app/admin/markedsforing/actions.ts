"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { getMarketingRecipients, type Segment, type Channel } from "@/lib/dm-queries";
import { siteUrl } from "@/lib/site-url";
import { kickMarketingWorker } from "@/lib/marketing-worker";

/**
 * Starter en utsending til et segment på e-post ELLER SMS. Kun admin, kun
 * til kunder med samtykke (håndteres i getMarketingRecipients), alltid med
 * avmeldingslenke.
 *
 * Alle mottakerne legges i en kø med én gang (tar et sekund), og en
 * bakgrunnsjobb sender i bolker til køen er tom – skjermen svarer
 * umiddelbart, og fremdriften vises under «Sendt før».
 */
export async function sendMarketing(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

  const channel: Channel =
    String(formData.get("channel") ?? "email") === "sms" ? "sms" : "email";
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const segment = String(formData.get("segment") ?? "all") as Segment;
  if (!body || (channel === "email" && !subject))
    redirect("/admin/markedsforing?feil=tomt");

  const sb = await createClient();

  // Dobbeltklikk-vern: samme emne + kanal + segment innen 15 minutter → nekt.
  const { data: dup } = await sb
    .from("marketing_sends")
    .select("id")
    .eq("channel", channel)
    .eq("segment", segment)
    .eq("subject", channel === "sms" ? subject || "SMS-utsending" : subject)
    .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .limit(1);
  if (dup && dup.length > 0) redirect("/admin/markedsforing?feil=dobbel");

  const recipients = (await getMarketingRecipients(segment, channel)).filter((r) => r.token);
  if (recipients.length === 0) redirect("/admin/markedsforing?feil=ingen");

  const { data: send, error } = await sb
    .from("marketing_sends")
    .insert({
      subject: channel === "sms" ? subject || "SMS-utsending" : subject,
      body,
      channel,
      segment,
      recipient_count: 0,
      total: recipients.length,
      status: "queued",
      created_by: me.userId,
    })
    .select("id")
    .single();
  if (error || !send) redirect("/admin/markedsforing?feil=db");

  // Kø-rader i bolker på 1000 (rask insert).
  for (let i = 0; i < recipients.length; i += 1000) {
    const rows = recipients.slice(i, i + 1000).map((r) => ({
      send_id: send.id as string,
      customer_id: r.id,
      email: channel === "email" ? r.email : null,
      phone: channel === "sms" ? r.phone : null,
      token: r.token,
    }));
    const { error: qErr } = await sb.from("marketing_queue").insert(rows);
    if (qErr) {
      await sb.from("marketing_sends").update({ status: "failed", last_error: qErr.message }).eq("id", send.id);
      redirect("/admin/markedsforing?feil=db");
    }
  }

  // Start bakgrunnsjobben etter at svaret er sendt til nettleseren.
  const base = siteUrl();
  after(async () => {
    await kickMarketingWorker(base);
  });

  revalidatePath("/admin/markedsforing");
  redirect(`/admin/markedsforing?startet=${recipients.length}&kanal=${channel}`);
}

/** Start/gjenoppta en utsending som står i kø (f.eks. etter feil). Kun admin. */
export async function resumeMarketing(sendId: string): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
  const sb = await createClient();
  await sb.from("marketing_sends").update({ status: "queued", last_error: null }).eq("id", sendId);
  const base = siteUrl();
  after(async () => {
    await kickMarketingWorker(base);
  });
  revalidatePath("/admin/markedsforing");
}

/* ------------------------- SEND TIL RESTEN ------------------------- */

/**
 * Hvem har allerede fått e-post med dette emnet? To kilder:
 *  1) køen (utsendinger etter kø-bygget), status «sent»
 *  2) Resends egen logg (GET /emails) – dekker eldre utsendinger som ble
 *     sendt før køen fantes. Bouncede/feilede regnes som IKKE mottatt.
 */
async function alreadyReceived(subject: string, since: string): Promise<{ set: Set<string>; fromResend: number; resendOk: boolean }> {
  const set = new Set<string>();
  const sb = await createClient();

  const { data: sends } = await sb.from("marketing_sends").select("id").eq("subject", subject);
  const ids = (sends ?? []).map((x) => x.id as string);
  if (ids.length) {
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .from("marketing_queue")
        .select("email")
        .in("send_id", ids)
        .eq("status", "sent")
        .range(from, from + 999);
      for (const r of data ?? []) if (r.email) set.add(String(r.email).trim().toLowerCase());
      if (!data || data.length < 1000) break;
    }
  }

  let fromResend = 0;
  let resendOk = false;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const cutoff = new Date(since).getTime() - 24 * 3600_000;
    let after: string | undefined;
    for (let page = 0; page < 300; page++) {
      const url = new URL("https://api.resend.com/emails");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
      if (!res) break;
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1200));
        page--;
        continue;
      }
      if (!res.ok) break;
      resendOk = true;
      const json = (await res.json()) as {
        data?: { id: string; to: string[] | string; subject: string; created_at: string; last_event?: string }[];
        has_more?: boolean;
      };
      const rows = json.data ?? [];
      let older = false;
      for (const e of rows) {
        if (new Date(e.created_at).getTime() < cutoff) older = true;
        if (e.subject !== subject) continue;
        if (e.last_event && /bounce|fail|complain/i.test(e.last_event)) continue;
        const tos = Array.isArray(e.to) ? e.to : [e.to];
        for (const t of tos) {
          const k = String(t).trim().toLowerCase();
          if (k && !set.has(k)) {
            set.add(k);
            fromResend++;
          }
        }
      }
      if (!json.has_more || rows.length === 0 || older) break;
      after = rows[rows.length - 1].id;
      await new Promise((r) => setTimeout(r, 550)); // Resend: ~2 kall/sek
    }
  }
  return { set, fromResend, resendOk };
}

/**
 * Send en tidligere e-postutsending på nytt til alle med samtykke som IKKE
 * har fått den (sjekkes mot køen + Resends logg). Kun admin.
 */
export async function sendToRest(sendId: string): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
  const sb = await createClient();
  const { data: orig } = await sb
    .from("marketing_sends")
    .select("subject, body, channel, segment, created_at")
    .eq("id", sendId)
    .maybeSingle();
  if (!orig || orig.channel === "sms") redirect("/admin/markedsforing?feil=rest");

  const { data: first } = await sb
    .from("marketing_sends")
    .select("created_at")
    .eq("subject", orig.subject)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { set, resendOk } = await alreadyReceived(orig.subject as string, (first?.created_at as string) ?? (orig.created_at as string));
  if (!resendOk && set.size === 0) redirect("/admin/markedsforing?feil=resendlogg");

  const all = (await getMarketingRecipients((orig.segment as Segment) ?? "all", "email")).filter((r) => r.token);
  const rest = all.filter((r) => !set.has(r.email.trim().toLowerCase()));
  if (rest.length === 0) redirect("/admin/markedsforing?feil=alleharfatt");

  const { data: send, error } = await sb
    .from("marketing_sends")
    .insert({
      subject: orig.subject,
      body: orig.body,
      channel: "email",
      segment: orig.segment,
      recipient_count: 0,
      total: rest.length,
      status: "queued",
      created_by: me.userId,
    })
    .select("id")
    .single();
  if (error || !send) redirect("/admin/markedsforing?feil=db");

  for (let i = 0; i < rest.length; i += 1000) {
    const rows = rest.slice(i, i + 1000).map((r) => ({
      send_id: send.id as string,
      customer_id: r.id,
      email: r.email,
      token: r.token,
    }));
    await sb.from("marketing_queue").insert(rows);
  }

  const base = siteUrl();
  after(async () => {
    await kickMarketingWorker(base);
  });
  revalidatePath("/admin/markedsforing");
  redirect(`/admin/markedsforing?startet=${rest.length}&kanal=email&utelatt=${all.length - rest.length}`);
}
