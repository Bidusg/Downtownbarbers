import { createServiceClient } from "@/lib/supabase/service";
import { renderMarketingEmail, sendEmailBatch } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { siteUrl } from "@/lib/site-url";

/* =====================================================================
 * MARKEDSFØRINGS-KØ (bakgrunnsjobb)
 *   Tar køede mottakere for én utsending om gangen og sender i bolker:
 *   e-post via Resend batch (100 per kall), SMS 5 parallelt. Kjører i inntil
 *   ~50 s per kall og sparker seg selv i gang igjen hvis det er mer igjen,
 *   så 6 000 e-poster tar et par minutter uten at noen venter på skjermen.
 * ===================================================================== */

const BUDGET_MS = 50_000;

function workerSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-24) || "";
}

/** Fyr av arbeideren (fire-and-forget). Brukes fra server actions og av arbeideren selv. */
export async function kickMarketingWorker(base: string): Promise<void> {
  try {
    await fetch(`${base}/api/marketing/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${workerSecret()}` },
      // Vi venter ikke på at hele jobben er ferdig – bare at den er startet.
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  } catch {
    /* beste innsats */
  }
}

export function isWorkerAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const secret = workerSecret();
  return !!secret && auth === `Bearer ${secret}`;
}

/** Kjør én runde. Returnerer hvor mange som ble sendt og om det er mer igjen. */
export async function runMarketingWorker(): Promise<{ sent: number; failed: number; more: boolean }> {
  const svc = createServiceClient();
  const base = siteUrl();
  const t0 = Date.now();
  let sent = 0;
  let failed = 0;

  while (Date.now() - t0 < BUDGET_MS) {
    // Eldste utsending som ikke er ferdig.
    const { data: send } = await svc
      .from("marketing_sends")
      .select("id, subject, body, channel")
      .in("status", ["queued", "sending"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!send) return { sent, failed, more: false };

    const sendId = send.id as string;
    await svc.from("marketing_sends").update({ status: "sending" }).eq("id", sendId);

    const { data: rows } = await svc
      .from("marketing_queue")
      .select("id, email, phone, token")
      .eq("send_id", sendId)
      .eq("status", "queued")
      .order("id")
      .limit(100);

    if (!rows || rows.length === 0) {
      // Ferdig med denne utsendingen.
      const { count: okCount } = await svc
        .from("marketing_queue")
        .select("id", { count: "exact", head: true })
        .eq("send_id", sendId)
        .eq("status", "sent");
      const { count: failCount } = await svc
        .from("marketing_queue")
        .select("id", { count: "exact", head: true })
        .eq("send_id", sendId)
        .eq("status", "failed");
      await svc
        .from("marketing_sends")
        .update({
          status: "done",
          recipient_count: okCount ?? 0,
          failed: failCount ?? 0,
          finished_at: new Date().toISOString(),
        })
        .eq("id", sendId);
      continue;
    }

    const ids = rows.map((r) => r.id as number);
    if (send.channel === "sms") {
      // SMS: 5 parallelt, enkeltvis status.
      for (let i = 0; i < rows.length; i += 5) {
        const chunk = rows.slice(i, i + 5);
        await Promise.all(
          chunk.map(async (r) => {
            const msg = `${send.body}\n\nAvmeld: ${base}/avmeld/${r.token} · eller svar STOPP`;
            const ok = r.phone ? await sendSms(r.phone as string, msg) : false;
            if (ok) sent++;
            else failed++;
            await svc
              .from("marketing_queue")
              .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null, error: ok ? null : "SMS feilet" })
              .eq("id", r.id as number);
          }),
        );
      }
    } else {
      const items = rows.map((r) => ({
        to: r.email as string,
        subject: send.subject as string,
        html: renderMarketingEmail({
          subject: send.subject as string,
          body: (send.body as string) ?? "",
          unsubscribeUrl: `${base}/avmeld/${r.token}`,
        }),
      }));
      const res = await sendEmailBatch(items);
      if (res.error) {
        // Rate-limit eller nettverk: marker feil på bolken, logg på utsendingen.
        failed += rows.length;
        await svc.from("marketing_queue").update({ status: "failed", error: res.error }).in("id", ids);
        await svc.from("marketing_sends").update({ last_error: res.error }).eq("id", sendId);
        // Liten pause så vi ikke hamrer videre på et rate-limit.
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        sent += rows.length;
        await svc
          .from("marketing_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .in("id", ids);
        // Resend: ~2 forespørsler/sek → hold oss under.
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    // Oppdater fremdrift (sendt så langt) på utsendingen.
    const { count: okCount } = await svc
      .from("marketing_queue")
      .select("id", { count: "exact", head: true })
      .eq("send_id", sendId)
      .eq("status", "sent");
    await svc.from("marketing_sends").update({ recipient_count: okCount ?? 0 }).eq("id", sendId);
  }

  return { sent, failed, more: true };
}
