"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import {
  filterCustomers,
  type CustomerFilter,
  type CustomerFilterRow,
} from "@/lib/customer-filter";
import { renderMarketingEmail, sendEmailBatch } from "@/lib/email";
import { kickMarketingWorker } from "@/lib/marketing-worker";
import { siteUrl } from "@/lib/site-url";

/** Kjør kunde-filteret (kun admin/eier). Returnerer radene som matcher. */
export async function runCustomerFilter(
  f: CustomerFilter,
): Promise<{ rows: CustomerFilterRow[]; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { rows: [], error: "Ingen tilgang." };
  const rows = await filterCustomers(f);
  return { rows };
}

type BarberInfo = { name: string; title?: string; photoUrl?: string };

/** Hent bilde + tittel for fremhevede barbere (til e-post-render). */
async function resolveBarbers(names: string[]): Promise<BarberInfo[]> {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff")
      .select("full_name, title, photo_url")
      .in("full_name", clean);
    const byName = new Map(
      ((data ?? []) as {
        full_name: string;
        title: string | null;
        photo_url: string | null;
      }[]).map((s) => [s.full_name, s]),
    );
    return clean.map((n) => {
      const s = byName.get(n);
      return s
        ? {
            name: s.full_name,
            title: s.title ?? undefined,
            photoUrl: s.photo_url ?? undefined,
          }
        : { name: n };
    });
  } catch {
    return clean.map((n) => ({ name: n }));
  }
}

/** Forhåndsvis e-posten (rendret HTML) – ingen utsending. */
export async function previewCampaign(input: {
  subject: string;
  body: string;
  featuredBarbers: string[];
}): Promise<{ html?: string; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const barbers = await resolveBarbers(input.featuredBarbers ?? []);
  const html = renderMarketingEmail({
    subject: input.subject || "(uten emne)",
    body: input.body || "",
    unsubscribeUrl: `${siteUrl()}/avmeld/forhandsvisning`,
    emailType: barbers.length ? "ny_barber" : "kampanje",
    barbers,
  });
  return { html };
}

/** Send en testutsending til én adresse (typisk deg selv). */
export async function testSendCampaign(input: {
  subject: string;
  body: string;
  featuredBarbers: string[];
  to: string;
}): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const to = input.to.trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
    return { error: "Oppgi en gyldig e-postadresse." };
  if (!input.subject.trim() || !input.body.trim())
    return { error: "Emne og melding er påkrevd." };
  const barbers = await resolveBarbers(input.featuredBarbers ?? []);
  const html = renderMarketingEmail({
    subject: input.subject,
    body: input.body,
    unsubscribeUrl: `${siteUrl()}/avmeld/test`,
    emailType: barbers.length ? "ny_barber" : "kampanje",
    barbers,
  });
  const res = await sendEmailBatch([
    { to, subject: `[TEST] ${input.subject}`, html },
  ]);
  if (res.error) return { error: res.error };
  return { ok: true };
}

/**
 * Start en ekte utsending til kundene i det valgte filteret – men KUN de med
 * markedsføringssamtykke og e-post. Gjenbruker markedsførings-pipelinen
 * (marketing_sends + marketing_queue + worker), så avmelding, logging og
 * batching er likt som fra markedsføringssiden.
 */
export async function sendFilterCampaign(input: {
  filter: CustomerFilter;
  subject: string;
  body: string;
  featuredBarbers: string[];
}): Promise<{ ok?: true; count?: number; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) return { error: "Emne og melding er påkrevd." };

  const sb = await createClient();

  // Mottakere = filtertreff med samtykke + e-post. Token hentes for avmelding.
  const rows = await filterCustomers(input.filter);
  const ids = rows.filter((r) => r.consent && r.email).map((r) => r.id);
  if (ids.length === 0)
    return { error: "Ingen mottakere med samtykke og e-post i dette filteret." };

  const recips: { id: string; email: string; token: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data } = await sb
      .from("customers")
      .select("id, email, portal_token")
      .in("id", chunk);
    for (const c of (data ?? []) as {
      id: string;
      email: string | null;
      portal_token: string | null;
    }[]) {
      if (c.portal_token && c.email?.trim())
        recips.push({
          id: c.id,
          email: c.email.trim(),
          token: c.portal_token,
        });
    }
  }
  if (recips.length === 0) return { error: "Fant ingen gyldige mottakere." };

  const featured = (input.featuredBarbers ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  const { data: send, error } = await sb
    .from("marketing_sends")
    .insert({
      subject,
      body,
      channel: "email",
      segment: "filter",
      email_type: featured.length ? "ny_barber" : "kampanje",
      featured_barber: featured.length ? featured.join(",") : null,
      recipient_count: 0,
      total: recips.length,
      status: "queued",
      created_by: me.userId,
    })
    .select("id")
    .single();
  if (error || !send)
    return {
      error: `Kunne ikke starte utsending: ${error?.message ?? "ukjent feil"}`,
    };

  for (let i = 0; i < recips.length; i += 1000) {
    const batch = recips.slice(i, i + 1000).map((r) => ({
      send_id: send.id as string,
      customer_id: r.id,
      email: r.email,
      phone: null,
      token: r.token,
    }));
    const { error: qErr } = await sb.from("marketing_queue").insert(batch);
    if (qErr) {
      await sb
        .from("marketing_sends")
        .update({ status: "failed", last_error: qErr.message })
        .eq("id", send.id);
      return { error: `Kunne ikke kø-legge mottakere: ${qErr.message}` };
    }
  }

  try {
    await kickMarketingWorker(siteUrl());
  } catch {
    // Workeren kan også startes av cron – utsendingen er allerede kø-lagt.
  }
  return { ok: true, count: recips.length };
}
