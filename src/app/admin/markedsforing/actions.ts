"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { getMarketingRecipients, type Segment, type Channel } from "@/lib/dm-queries";
import { siteUrl } from "@/lib/site-url";
import { kickMarketingWorker, runMarketingWorker } from "@/lib/marketing-worker";

/** Kjør første runde direkte (ingen avhengighet til HTTP-selvkall), kjed videre ved behov. */
function startWorkerAfterResponse() {
  const base = siteUrl();
  after(async () => {
    try {
      const r = await runMarketingWorker();
      if (r.more) await kickMarketingWorker(base);
    } catch {
      await kickMarketingWorker(base);
    }
  });
}

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
  if (!me || !isAdminRole(me.role))
    redirect("/admin/markedsforing?feil=tilgang");

  const channel: Channel =
    String(formData.get("channel") ?? "email") === "sms" ? "sms" : "email";
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const segment = String(formData.get("segment") ?? "all") as Segment;
  const emailType = String(formData.get("email_type") ?? "standard").trim() || "standard";
  // Fremhevet barber kun relevant for «ny_barber»-typen.
  const featuredBarber =
    emailType === "ny_barber"
      ? String(formData.get("featured_barber") ?? "").trim() || null
      : null;
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
      email_type: emailType,
      featured_barber: featuredBarber,
      recipient_count: 0,
      total: recipients.length,
      status: "queued",
      created_by: me.userId,
    })
    .select("id")
    .single();
  if (error || !send) {
    console.error("marketing_sends insert feilet:", error?.message, error?.details ?? "");
    redirect(
      "/admin/markedsforing?feil=db&detalj=" +
        encodeURIComponent((error?.message ?? "ukjent feil").slice(0, 200)),
    );
  }

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
      redirect("/admin/markedsforing?feil=db&detalj=" + encodeURIComponent(qErr.message.slice(0, 200)));
    }
  }

  // Start bakgrunnsjobben etter at svaret er sendt til nettleseren.
  startWorkerAfterResponse();

  revalidatePath("/admin/markedsforing");
  redirect(`/admin/markedsforing?startet=${recipients.length}&kanal=${channel}`);
}

/* ------------------------- ARKIVER / GJENOPPRETT ------------------------- */

/**
 * Arkiver (skjul) utsendinger fra loggen. Rader SLETTES IKKE – de får bare
 * `archived_at` satt, så «hvem har fått den»-oversikten beholdes. Kun admin.
 */
export async function archiveMarketingSends(
  ids: string[],
): Promise<{ ok?: true; count?: number; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const clean = (ids ?? []).filter(Boolean);
  if (clean.length === 0) return { error: "Ingen rader valgt." };
  const sb = await createClient();
  const { error } = await sb
    .from("marketing_sends")
    .update({ archived_at: new Date().toISOString() })
    .in("id", clean);
  if (error) {
    // Vanligste årsak: kolonnen archived_at finnes ikke ennå.
    if (/archived_at/.test(error.message))
      return {
        error:
          "Kjør KJØR-I-SUPABASE-ARKIVER-UTSENDINGER.sql i Supabase først – da virker arkivering.",
      };
    return { error: error.message };
  }
  revalidatePath("/admin/markedsforing");
  return { ok: true, count: clean.length };
}

/** Gjenopprett arkiverte utsendinger (tilbake i loggen). Kun admin. */
export async function unarchiveMarketingSends(
  ids: string[],
): Promise<{ ok?: true; count?: number; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const clean = (ids ?? []).filter(Boolean);
  if (clean.length === 0) return { error: "Ingen rader valgt." };
  const sb = await createClient();
  const { error } = await sb
    .from("marketing_sends")
    .update({ archived_at: null })
    .in("id", clean);
  if (error) return { error: error.message };
  revalidatePath("/admin/markedsforing");
  return { ok: true, count: clean.length };
}

/** Start/gjenoppta en utsending som står i kø (f.eks. etter feil). Kun admin. */
export async function resumeMarketing(sendId: string): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
  const sb = await createClient();
  await sb.from("marketing_sends").update({ status: "queued", last_error: null }).eq("id", sendId);
  // Feilede mottakere legges tilbake i køen.
  await sb.from("marketing_queue").update({ status: "queued", error: null }).eq("send_id", sendId).eq("status", "failed");
  startWorkerAfterResponse();
  revalidatePath("/admin/markedsforing");
}

/* ------------------------- SEND TIL RESTEN ------------------------- */

/**
 * Hvem har allerede fått e-post med dette emnet? To kilder:
 *  1) køen (utsendinger etter kø-bygget), status «sent»
 *  2) Resends egen logg (GET /emails) – dekker eldre utsendinger som ble
 *     sendt før køen fantes. Bouncede/feilede regnes som IKKE mottatt.
 */
type ResendStatus = "ok" | "restricted" | "error" | "nokey";

async function alreadyReceived(
  subject: string,
  since: string,
): Promise<{ set: Set<string>; fromQueue: number; fromResend: number; resendOk: boolean; resendStatus: ResendStatus; resendDetail?: string }> {
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

  const fromQueue = set.size;
  let fromResend = 0;
  let resendOk = false;
  let resendStatus: ResendStatus = "nokey";
  let resendDetail: string | undefined;
  // Lesing av loggen krever en nøkkel med «Full access». Sendenøkkelen har
  // ofte bare «Sending access» – da kan en egen RESEND_LOG_KEY settes.
  // Rens nøkkelen: mellomrom/linjeskift/anførselstegn fra innliming i Vercel
  // gir «API key is invalid» fra Resend.
  const clean = (v?: string) => (v ?? "").trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
  const key = clean(process.env.RESEND_LOG_KEY) || clean(process.env.RESEND_API_KEY);
  if (key) {
    resendStatus = "error";
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
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        resendStatus = res.status === 401 || res.status === 403 || /restricted/i.test(txt) ? "restricted" : "error";
        resendDetail = `${res.status} ${txt.slice(0, 160)}`;
        break;
      }
      resendOk = true;
      resendStatus = "ok";
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
  return { set, fromQueue, fromResend, resendOk, resendStatus, resendDetail };
}

export type RestPreview = {
  ok: boolean;
  total: number; // alle med samtykke + e-post i segmentet
  already: number; // har fått den (kø + Resend)
  rest: number; // får den nå
  resendStatus: ResendStatus;
  resendDetail?: string;
  error?: string;
};

/** Forhåndsvisning før «Send til resten»: hvor mange har fått den, hvor mange gjenstår. */
export async function previewRest(sendId: string): Promise<RestPreview> {
  const me = await getUserRole();
  const empty: RestPreview = { ok: false, total: 0, already: 0, rest: 0, resendStatus: "error" };
  if (!me || !isAdminRole(me.role)) return { ...empty, error: "Ingen tilgang." };
  try {
    const sb = await createClient();
    const { data: orig } = await sb
      .from("marketing_sends")
      .select("subject, channel, segment, created_at")
      .eq("id", sendId)
      .maybeSingle();
    if (!orig || orig.channel === "sms")
      return { ...empty, error: "Fant ikke e-postutsendingen." };

    // «filter»-utsendinger (fra kunde-filteret) har ikke et fast segment vi kan
    // regne om til en mottakerliste. «Resten» = nøyaktig de mottakerne DENNE
    // utsendingen allerede hadde i køen, men som ennå ikke er sendt (feilet
    // eller fortsatt i kø). Da treffer vi bare de rette kundene, og kan aldri
    // sende dobbelt til de som alt har fått e-posten.
    if ((orig.segment as string) === "filter") {
      const { count: total } = await sb
        .from("marketing_queue")
        .select("id", { count: "exact", head: true })
        .eq("send_id", sendId);
      const { count: sent } = await sb
        .from("marketing_queue")
        .select("id", { count: "exact", head: true })
        .eq("send_id", sendId)
        .eq("status", "sent");
      const totalN = total ?? 0;
      const sentN = sent ?? 0;
      return {
        ok: true,
        total: totalN,
        already: sentN,
        rest: Math.max(0, totalN - sentN),
        resendStatus: "ok",
      };
    }

    const { data: first } = await sb
      .from("marketing_sends")
      .select("created_at")
      .eq("subject", orig.subject)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const r = await alreadyReceived(orig.subject as string, (first?.created_at as string) ?? (orig.created_at as string));
    const all = (await getMarketingRecipients((orig.segment as Segment) ?? "all", "email")).filter((x) => x.token);
    const rest = all.filter((x) => !r.set.has(x.email.trim().toLowerCase())).length;
    // Trygt å sende bare hvis vi faktisk vet hvem som har fått den.
    const known = r.resendOk || r.fromQueue > 0;
    return {
      ok: known,
      total: all.length,
      already: all.length - rest,
      rest,
      resendStatus: r.resendStatus,
      resendDetail: r.resendDetail,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message.slice(0, 160) : "Noe gikk galt." };
  }
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

  // «filter»-utsending: gjenoppta KUN de mottakerne denne utsendingen allerede
  // hadde, men som ikke er sendt (feilet/i kø). Ingen ny utsending, ingen
  // re-beregning av segment → de som alt har fått e-posten røres aldri. Dette
  // er trygt mot duplikater, og er riktig mekanisme når en utsending delvis
  // feilet på rate-limit.
  if ((orig.segment as string) === "filter") {
    const { count: rest } = await sb
      .from("marketing_queue")
      .select("id", { count: "exact", head: true })
      .eq("send_id", sendId)
      .neq("status", "sent");
    if (!rest || rest === 0) redirect("/admin/markedsforing?feil=alleharfatt");
    await sb
      .from("marketing_queue")
      .update({ status: "queued", error: null })
      .eq("send_id", sendId)
      .neq("status", "sent");
    await sb
      .from("marketing_sends")
      .update({ status: "queued", last_error: null })
      .eq("id", sendId);
    startWorkerAfterResponse();
    revalidatePath("/admin/markedsforing");
    redirect(`/admin/markedsforing?startet=${rest}&kanal=email`);
  }

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
  if (error || !send) {
    console.error("marketing_sends insert feilet:", error?.message, error?.details ?? "");
    redirect(
      "/admin/markedsforing?feil=db&detalj=" +
        encodeURIComponent((error?.message ?? "ukjent feil").slice(0, 200)),
    );
  }

  for (let i = 0; i < rest.length; i += 1000) {
    const rows = rest.slice(i, i + 1000).map((r) => ({
      send_id: send.id as string,
      customer_id: r.id,
      email: r.email,
      token: r.token,
    }));
    await sb.from("marketing_queue").insert(rows);
  }

  startWorkerAfterResponse();
  revalidatePath("/admin/markedsforing");
  redirect(`/admin/markedsforing?startet=${rest.length}&kanal=email&utelatt=${all.length - rest.length}`);
}
