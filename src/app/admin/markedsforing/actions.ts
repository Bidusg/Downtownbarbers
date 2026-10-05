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
