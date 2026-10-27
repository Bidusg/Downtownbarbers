"use server";

import { getUserRole, isAdminRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveMx, resolveTxt } from "node:dns/promises";
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

/** MX-oppslag som aldri kaster. */
async function mx(name: string): Promise<string[]> {
  try {
    return (await resolveMx(name)).map((r) => `${r.priority} ${r.exchange}`);
  } catch {
    return [];
  }
}

/**
 * Autentiseringen i DNS. Resend sender med konvolutt-avsender (Return-Path)
 * på `send.<domene>`, og det er DER SPF-recorden skal ligge – ikke på
 * hoveddomenet. SPF på hoveddomenet gjelder e-posten dere sender fra
 * webhotellet og har ingenting med Resend å gjøre.
 *
 * DMARC godkjenner e-posten hvis ENTEN SPF ELLER DKIM passerer og er
 * justert mot avsenderdomenet. Står DMARC på p=quarantine eller p=reject,
 * går ALT som ikke passerer rett i søppelpost – da må Resend-oppsettet være
 * helt på plass, ikke nesten.
 */
async function dnsRows(fromAddr: string): Promise<DiagRow[]> {
  const domain = domainOf(fromAddr);
  if (!domain || /resend\.dev$/i.test(domain)) return [];
  const rows: DiagRow[] = [];

  const [root, send, sendMx, dkim, dmarc] = await Promise.all([
    txt(domain),
    txt(`send.${domain}`),
    mx(`send.${domain}`),
    txt(`resend._domainkey.${domain}`),
    txt(`_dmarc.${domain}`),
  ]);

  const spfOf = (recs: string[]) => recs.find((r) => /^v=spf1/i.test(r.trim()));
  const sendSpf = spfOf(send);
  const rootSpf = spfOf(root);

  rows.push({
    label: `SPF på send.${domain} (Resend)`,
    ok: !!sendSpf,
    detail: sendSpf
      ? `${sendSpf}${
          rootSpf ? ` — SPF på selve ${domain} («${rootSpf}») gjelder webhotellet og skal IKKE røres.` : ""
        }`
      : `Mangler. Legg inn TXT på send.${domain} med verdien Resend oppgir (vanligvis «v=spf1 include:amazonses.com ~all»).${
          rootSpf
            ? ` La SPF-recorden på selve ${domain} stå som den er – den gjelder e-posten fra webhotellet, og Resend bruker den ikke.`
            : ""
        }`,
  });

  rows.push({
    label: `MX på send.${domain}`,
    ok: sendMx.length > 0,
    detail: sendMx.length
      ? sendMx.join(", ")
      : `Mangler. Resend bruker den til å ta imot avvisninger og klager. Verdien står i Resend → Domains → ${domain}.`,
  });

  rows.push({
    label: `DKIM på ${domain}`,
    ok: dkim.length > 0,
    detail: dkim.length
      ? "Nøkkelen ligger ute. At den finnes betyr ikke at Resend faktisk signerer – domenet må også stå som «Verified» i Resend → Domains."
      : `Ingen DKIM-nøkkel på resend._domainkey.${domain}. Uten signatur er e-posten ikke autentisert. Hent verdien i Resend → Domains → ${domain}.`,
  });

  const dm = dmarc.find((r) => /^v=DMARC1/i.test(r.trim()));
  const policy = dm?.match(/\bp\s*=\s*(none|quarantine|reject)/i)?.[1]?.toLowerCase() ?? null;
  const strict = policy === "quarantine" || policy === "reject";
  rows.push({
    label: `DMARC på ${domain}`,
    ok: !!dm,
    detail: dm
      ? `${dm}${
          strict
            ? ` — p=${policy} betyr at e-post som IKKE passerer autentisering blir ${
                policy === "reject" ? "avvist" : "lagt i søppelpost"
              }. Havner alt i søppelpost, er dette den mest sannsynlige årsaken.`
            : ""
        }`
      : `Ingen DMARC-record. Legg inn TXT på _dmarc.${domain}: «v=DMARC1; p=none; rua=mailto:post@${domain}».`,
  });

  // Streng policy + manglende byggekloss = alt havner i søppelpost.
  if (strict && (!sendSpf || dkim.length === 0)) {
    rows.push({
      label: "Streng DMARC uten fullt Resend-oppsett",
      ok: false,
      detail: `DMARC står på p=${policy}, samtidig som ${
        !sendSpf && dkim.length === 0
          ? "både SPF og DKIM for Resend mangler"
          : !sendSpf
            ? `SPF på send.${domain} mangler`
            : "DKIM mangler"
      }. Det er nøyaktig kombinasjonen som sender ALT i søppelpost. Fullfør oppsettet i Resend → Domains først; sett eventuelt DMARC midlertidig til p=none mens du retter.`,
    });
  }

  // Rapportene bør gå til dere, ikke til domeneleverandøren.
  const rua = dm?.match(/\brua\s*=\s*mailto:([^;\s]+)/i)?.[1];
  if (rua && !rua.toLowerCase().includes(domain)) {
    rows.push({
      label: "DMARC-rapporter",
      ok: false,
      detail: `Rapportene går til ${rua}, ikke til dere. Da ser dere aldri hvilke e-poster som feiler autentisering. Endre rua til en adresse på ${domain}.`,
    });
  }

  rows.push({
    label: "Fasiten ligger i e-posten du nettopp fikk",
    ok: true,
    detail:
      "Åpne test-e-posten i Gmail → de tre prikkene → «Vis original». Øverst står SPF, DKIM og DMARC med PASS eller FAIL. Det er det eneste som sier sikkert om autentiseringen virker – DNS-sjekkene over viser bare at postene finnes.",
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
