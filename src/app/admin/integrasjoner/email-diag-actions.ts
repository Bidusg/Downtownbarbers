"use server";

import { getUserRole, isAdminRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveTxt } from "node:dns/promises";
import { emailDeliveryStatus, emailFromInUse, marketingFromInUse, sendTestEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/validate";

export type DiagRow = { label: string; ok: boolean; detail: string };

/** Domenet i en avsenderadresse («Navn <post@dittdomene.no>» → dittdomene.no). */
function domainOf(addr: string): string {
  return (addr.match(/@([^>\s]+)/)?.[1] ?? "").trim().toLowerCase();
}

/** TXT-oppslag som aldri kaster – tom liste betyr «ingen record». */
async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

/**
 * SPF, DKIM og DMARC på avsenderdomenet. Mangler de, signerer vi ikke
 * e-posten, og både Gmail og Outlook sorterer den som søppelpost nesten
 * uansett hva den inneholder. Gmail og Yahoo KREVER i tillegg DMARC av alle
 * som sender i volum.
 */
async function dnsRows(fromAddr: string): Promise<DiagRow[]> {
  const domain = domainOf(fromAddr);
  if (!domain || /resend\.dev$/i.test(domain)) return [];
  const rows: DiagRow[] = [];

  const [root, send, dkim, dmarc] = await Promise.all([
    txt(domain),
    txt(`send.${domain}`),
    txt(`resend._domainkey.${domain}`),
    txt(`_dmarc.${domain}`),
  ]);

  const spf = [...root, ...send].find((r) => /^v=spf1/i.test(r.trim()));
  rows.push({
    label: `SPF på ${domain}`,
    ok: !!spf && /amazonses\.com|resend/i.test(spf),
    detail: !spf
      ? `Ingen SPF-record. Legg inn TXT på send.${domain} med verdien «v=spf1 include:amazonses.com ~all» (Resend → Domains viser den eksakte verdien).`
      : /amazonses\.com|resend/i.test(spf)
        ? spf
        : `${spf} – mangler «include:amazonses.com», som er det Resend sender gjennom.`,
  });

  rows.push({
    label: `DKIM på ${domain}`,
    ok: dkim.length > 0,
    detail: dkim.length
      ? "Signaturnøkkelen ligger ute. E-postene blir signert."
      : `Ingen DKIM-nøkkel på resend._domainkey.${domain}. Uten den er e-posten usignert, og da havner den i søppelpost nesten uansett. Hent verdien i Resend → Domains → ${domain} og legg den inn hos domeneleverandøren.`,
  });

  const dm = dmarc.find((r) => /^v=DMARC1/i.test(r.trim()));
  rows.push({
    label: `DMARC på ${domain}`,
    ok: !!dm,
    detail: dm
      ? dm
      : `Ingen DMARC-record. Legg inn TXT på _dmarc.${domain} med verdien «v=DMARC1; p=none; rua=mailto:post@${domain}». p=none overvåker bare og blokkerer ingenting, men Gmail og Yahoo krever at recorden finnes.`,
  });

  return rows;
}

/**
 * «Feilsøk e-post og kundeinnlogging» i admin → Integrasjoner.
 * Sjekker det kundeinnlogging, registrering og ordrebekreftelser trenger,
 * og sender en ekte test-e-post. Viser Resend sitt eksakte svar.
 */
export async function runEmailDiagnostics(to: string): Promise<{ rows: DiagRow[] } | { error: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  const target = to.trim().toLowerCase() || me.email || "";
  if (!isValidEmail(target)) return { error: "Skriv inn en gyldig e-postadresse." };

  const rows: DiagRow[] = [];

  // 1) Service-nøkkelen (all kundeinnlogging går via den).
  let svc: ReturnType<typeof createServiceClient> | null = null;
  try {
    svc = createServiceClient();
    const { error } = await svc.from("customers").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
    rows.push({ label: "SUPABASE_SERVICE_ROLE_KEY", ok: true, detail: "Virker." });
  } catch (e) {
    svc = null;
    rows.push({
      label: "SUPABASE_SERVICE_ROLE_KEY",
      ok: false,
      detail: `${e instanceof Error ? e.message : e} – legg inn riktig nøkkel i Vercel (Settings → API → service_role) og redeploy.`,
    });
  }

  // 2) Tabellen for engangskoder (KJØR-I-SUPABASE-KUNDEKONTO.sql).
  if (svc) {
    const { error } = await svc.from("customer_login_codes").select("id", { head: true, count: "exact" }).limit(1);
    rows.push({
      label: "Tabellen customer_login_codes",
      ok: !error,
      detail: error
        ? `Mangler (${error.message}). Kjør KJØR-I-SUPABASE-KUNDEKONTO.sql i Supabase.`
        : "Finnes.",
    });
  }

  // 3) Avsender.
  const from = emailFromInUse();
  const testSender = /onboarding@resend\.dev/i.test(from);
  rows.push({
    label: "Avsender (EMAIL_FROM)",
    ok: !testSender,
    detail: testSender
      ? `${from} – Resend sin testavsender kan BARE sende til e-posten Resend-kontoen er registrert med. Kunder får ingenting. Verifiser downtownbarbers.no i Resend og sett EMAIL_FROM, f.eks. «Downtown Barbers <post@downtownbarbers.no>».`
      : from,
  });

  // 3b) Nyhetsbrev må sendes fra en ANNEN avsender enn bekreftelsene.
  const mkt = marketingFromInUse();
  const sameSender = mkt.trim().toLowerCase() === from.trim().toLowerCase();
  rows.push({
    label: "Avsender for nyhetsbrev (EMAIL_FROM_MARKETING)",
    ok: !sameSender,
    detail: sameSender
      ? `Samme adresse som bekreftelsene. Da drar én kunde som merker et nyhetsbrev som søppelpost også ordre-, booking- og innloggingskodene med seg ned i filteret. Sett EMAIL_FROM_MARKETING til et eget subdomene – f.eks. «Downtown Barbers <nyheter@nyhetsbrev.${domainOf(from) || "downtownbarbers.no"}>» – og verifiser det i Resend.`
      : `${mkt}${
          domainOf(mkt) === domainOf(from)
            ? " – skilt fra bekreftelsene, men på samme domene. Et eget subdomene skiller omdømmet helt."
            : " – skilt fra bekreftelsene."
        }`,
  });

  // 3c) Signering og autentisering i DNS.
  if (!testSender) rows.push(...(await dnsRows(from)));

  // 4) Ekte test-e-post.
  const r = await sendTestEmail(target);
  rows.push({
    label: `Test-e-post til ${target}`,
    ok: r.ok,
    detail: r.ok
      ? `${r.detail} Sjekk innboksen (og søppelpost).`
      : `Avvist${r.status ? ` (${r.status})` : ""}: ${r.detail}`,
  });

  // 5) Kom den faktisk frem? «Akseptert» betyr bare at Resend tok imot den.
  //    Står adressen på Resend sin sperreliste (etter en avvisning eller
  //    «marker som søppelpost»), blir ingenting levert – heller ikke koder.
  if (r.ok && r.id) {
    let st = { event: null as string | null, detail: "" };
    for (let i = 0; i < 4; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      st = await emailDeliveryStatus(r.id);
      if (!st.event || !["queued", "scheduled", "sent"].includes(st.event)) break;
    }
    const EXPLAIN: Record<string, string> = {
      delivered: "Levert til mottakerens e-postserver. Finner du den ikke, ligger den i søppelpost/kampanjer.",
      suppressed:
        "SPERRET av Resend: adressen står på sperrelisten (har tidligere avvist e-post eller merket den som søppelpost). Ingenting blir levert til den – heller ikke innloggingskoder. Fjern adressen i Resend → Emails → Suppressions.",
      bounced: "Avvist av mottakerens e-postserver. Sjekk adressen, og at domenet er verifisert (SPF/DKIM) i Resend.",
      complained: "Mottakeren har merket e-post fra dere som søppelpost. Resend sperrer adressen for videre utsending.",
      delivery_delayed: "Forsinket hos mottakeren. Prøv igjen om litt.",
      sent: "Sendt, men ikke bekreftet levert ennå. Sjekk igjen om et minutt.",
      queued: "Står i kø hos Resend.",
    };
    const ok = st.event === "delivered" || st.event === "sent" || st.event === "queued";
    rows.push({
      label: "Levering",
      ok: st.event ? ok : true,
      detail: st.event ? `${st.event}: ${EXPLAIN[st.event] ?? ""}` : st.detail,
    });
  }

  return { rows };
}
