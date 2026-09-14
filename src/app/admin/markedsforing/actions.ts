"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { getMarketingRecipients, type Segment } from "@/lib/dm-queries";
import { sendMarketingEmail } from "@/lib/email";

/**
 * Sender en markedsførings-e-post til et segment. Kun admin, kun til kunder
 * med samtykke (håndteres i getMarketingRecipients), alltid med avmeldingslenke.
 */
export async function sendMarketing(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || me.role !== "admin") return;

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const segment = String(formData.get("segment") ?? "all") as Segment;
  if (!subject || !body) redirect("/admin/markedsforing?feil=tomt");

  const recipients = await getMarketingRecipients(segment);
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
        const ok = await sendMarketingEmail({
          to: r.email,
          subject,
          body,
          unsubscribeUrl: `${base}/avmeld/${r.token}`,
        });
        if (ok) sent++;
      }),
    );
  }

  const sb = await createClient();
  await sb.from("marketing_sends").insert({
    subject,
    body,
    channel: "email",
    segment,
    recipient_count: sent,
    created_by: me.userId,
  });

  revalidatePath("/admin/markedsforing");
  redirect(`/admin/markedsforing?sendt=${sent}`);
}
