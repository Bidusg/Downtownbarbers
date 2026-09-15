"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { getMarketingRecipients, type Segment, type Channel } from "@/lib/dm-queries";
import { sendMarketingEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

/**
 * Sender en markedsføring til et segment på e-post ELLER SMS. Kun admin, kun
 * til kunder med samtykke (håndteres i getMarketingRecipients), alltid med
 * avmeldingslenke (samme /avmeld/[token] for begge kanaler).
 */
export async function sendMarketing(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;

  const channel: Channel =
    String(formData.get("channel") ?? "email") === "sms" ? "sms" : "email";
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const segment = String(formData.get("segment") ?? "all") as Segment;
  // SMS trenger ikke emne; e-post krever både emne og tekst.
  if (!body || (channel === "email" && !subject))
    redirect("/admin/markedsforing?feil=tomt");

  const recipients = await getMarketingRecipients(segment, channel);
  const capped = recipients.slice(0, 500); // trygg grense per utsending
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://downtownbarbers.no";

  let sent = 0;
  // Send i småbolker for å unngå timeout på lange lister.
  for (let i = 0; i < capped.length; i += 20) {
    const batch = capped.slice(i, i + 20);
    await Promise.all(
      batch.map(async (r) => {
        if (!r.token) return;
        if (channel === "sms") {
          if (!r.phone) return;
          const msg = `${body}\n\nAvmeld: ${base}/avmeld/${r.token}`;
          if (await sendSms(r.phone, msg)) sent++;
        } else {
          const ok = await sendMarketingEmail({
            to: r.email,
            subject,
            body,
            unsubscribeUrl: `${base}/avmeld/${r.token}`,
          });
          if (ok) sent++;
        }
      }),
    );
  }

  const sb = await createClient();
  await sb.from("marketing_sends").insert({
    subject: channel === "sms" ? subject || "SMS-utsending" : subject,
    body,
    channel,
    segment,
    recipient_count: sent,
    created_by: me.userId,
  });

  revalidatePath("/admin/markedsforing");
  redirect(`/admin/markedsforing?sendt=${sent}&kanal=${channel}`);
}
