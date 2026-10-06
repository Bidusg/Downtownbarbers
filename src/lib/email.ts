/**
 * E-post via Resend (kun server). Sender kun hvis RESEND_API_KEY finnes –
 * ellers hopper den stille over (så booking fungerer uansett).
 * EMAIL_FROM settes når eget domene er verifisert; faller ellers tilbake
 * til Resend sin testavsender.
 *
 * Alle e-poster bruker én felles «premium»-mal (pageWrap): Downtown Barbers-
 * logo i toppen, mørk merkevare-bakgrunn, og en bunn med veibeskrivelse
 * (Google Maps), ringeknapp og sosiale lenker. Malen er bygget tabell-basert
 * med inline-stiler slik at den rendrer likt i Gmail, Apple Mail og Outlook.
 */

import { salon } from "@/lib/data/salon";
import { siteUrl } from "@/lib/site-url";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/* ---- Merkevare-paletten (speiler nettsiden) ---------------------------- */
// Lys palett (som nettsiden i lys modus). Valgt bevisst: Gmail-appen i mørk
// modus inverterer MØRKE e-poster på egen hånd (og ignorerer color-scheme-
// metaene), så en mørk mal så lys ut på mobil og mørk på PC. En lys mal lar
// alle klienter stå i fred → samme utseende overalt.
const C = {
  bg: "#ECE7DF", // ytre bakgrunn (varm beige)
  card: "#FBF9F5", // kort (krem)
  cream: "#211E1A", // primærtekst (espresso)
  soft: "#4A433C", // sekundærtekst
  muted: "#7A7168", // dempet tekst
  line: "#DDD6CC", // linjer
  accent: "#C8531C", // brent oransje (god kontrast på lyst)
  ink: "#FFFFFF", // tekst på oransje knapp/avatar
};

/* siteUrl() hentes nå fra @/lib/site-url (auto-faller tilbake til Vercels
   stabile produksjons-URL når NEXT_PUBLIC_SITE_URL ikke er satt). */

/** Google Maps-veibeskrivelse bygget fra adressen. */
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  salon.address,
)}`;
/** tel:-lenke (kun sifre og +). */
const TEL = salon.phone.replace(/[^\d+]/g, "");

function fromAddress() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "Downtown Barbers <onboarding@resend.dev>"
  );
}

/** Lav-nivå sender. Returnerer true hvis forsøkt sendt, false hvis hoppet over. */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to, subject, html }),
    });
    // 429 (rate limit) og 4xx/5xx regnes som ikke sendt.
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send inntil 100 e-poster i ÉN forespørsel (Resend batch-API). Brukes av
 * markedsførings-køen: Resend tillater ~2 forespørsler/sek, så enkeltsending
 * av tusenvis ville stoppet på rate-limit – batch gir 200 e-poster/sek.
 * Returnerer { ok: antall akseptert, error } – ved feil er ingen sendt.
 */
export async function sendEmailBatch(
  items: { to: string; subject: string; html: string }[],
): Promise<{ ok: number; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: 0, error: "RESEND_API_KEY mangler" };
  if (items.length === 0) return { ok: 0 };
  try {
    const res = await fetch(`${RESEND_ENDPOINT}/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        items.slice(0, 100).map((it) => ({ from: fromAddress(), to: it.to, subject: it.subject, html: it.html })),
      ),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: 0, error: `Resend ${res.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
    return { ok: Array.isArray(json?.data) ? json!.data!.length : items.length };
  } catch (e) {
    return { ok: 0, error: e instanceof Error ? e.message : "nettverksfeil" };
  }
}

/** «2026-10-05» → «Mandag 5. oktober 2026» (ISO-datoer uendret ellers). */
function prettyDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = new Date(d + "T12:00:00Z").toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---- Felles bunn: veibeskrivelse + ring + sosiale lenker --------------- */
function footerHtml(): string {
  return `
      <tr><td style="padding:4px 32px 0">
        <div style="height:1px;background:${C.line};margin:26px 0 0;font-size:0;line-height:0">&nbsp;</div>
      </td></tr>
      <tr><td align="center" style="padding:22px 32px 2px">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
          <td style="padding:0 5px">
            <a href="${MAPS_URL}" style="display:inline-block;border:1px solid ${C.line};color:${C.cream};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:11px 18px">Veibeskrivelse</a>
          </td>
          <td style="padding:0 5px">
            <a href="tel:${TEL}" style="display:inline-block;border:1px solid ${C.line};color:${C.cream};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:11px 18px">Ring oss</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="padding:16px 32px 2px">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.soft};line-height:1.6">
          <a href="${MAPS_URL}" style="color:${C.soft};text-decoration:none">${escapeHtml(salon.address)}</a>
          &nbsp;·&nbsp;
          <a href="tel:${TEL}" style="color:${C.soft};text-decoration:none">${escapeHtml(salon.phone)}</a>
        </p>
      </td></tr>
      <tr><td align="center" style="padding:10px 32px 32px">
        <a href="${salon.social.instagram}" style="color:${C.accent};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.06em">Instagram</a>
        <span style="color:${C.line}">&nbsp;&nbsp;·&nbsp;&nbsp;</span>
        <a href="${salon.social.facebook}" style="color:${C.accent};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:.06em">Facebook</a>
      </td></tr>`;
}

/**
 * Ytre ramme for alle e-poster: logo-topp, innhold, premium-bunn.
 * `inner` er ferdig HTML som legges inn i kort-kroppen.
 */
function pageWrap(inner: string): string {
  const site = siteUrl();
  return `<!DOCTYPE html>
<html lang="nb" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light;supported-color-schemes:light}</style></head>
<body bgcolor="${C.bg}" style="margin:0;padding:0;background:${C.bg};background-color:${C.bg};-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg}">
    <tr><td align="center" bgcolor="${C.bg}" style="padding:30px 14px;background-color:${C.bg}">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${C.card}" class="card" style="width:600px;max-width:100%;background:${C.card};background-color:${C.card};border:1px solid ${C.line}">
        <tr><td align="center" style="padding:38px 32px 0">
          <a href="${site}" style="text-decoration:none">
            <img src="${site}/downtown-logo-email-dark.png" width="168" alt="Downtown Barbers" style="display:block;width:168px;max-width:58%;height:auto;border:0;outline:none;text-decoration:none">
          </a>
        </td></tr>
        <tr><td style="padding:0 32px">
          <div style="height:1px;background:${C.line};margin:22px 0 0;font-size:0;line-height:0">&nbsp;</div>
        </td></tr>
        <tr><td style="padding:28px 32px 10px">
          ${inner}
        </td></tr>
${footerHtml()}
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">
        <tr><td align="center" style="padding:16px 14px 6px;font-family:Arial,Helvetica,sans-serif;color:${C.muted};font-size:11px;line-height:1.6">
          © ${new Date().getFullYear()} Downtown Barbers · ${escapeHtml(salon.address)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ---- Barber-blokk: bilde (eller initialer) + navn + tittel ------------- */
type BarberInfo = { name: string; title?: string; photoUrl?: string };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "DB";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function barberBlock(b: BarberInfo): string {
  const avatar = b.photoUrl
    ? `<img src="${escapeHtml(b.photoUrl)}" width="64" height="64" alt="${escapeHtml(
        b.name,
      )}" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid ${C.accent}">`
    : `<table role="presentation" width="64" height="64" cellpadding="0" cellspacing="0" style="width:64px;height:64px">
         <tr><td align="center" valign="middle" style="width:64px;height:64px;background:${C.accent};border-radius:50%;color:${C.ink};font-family:Georgia,serif;font-size:22px;font-weight:bold">${initials(
           b.name,
         )}</td></tr>
       </table>`;
  const title = b.title
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.muted};margin-top:3px">${escapeHtml(
        b.title,
      )}</div>`
    : "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 2px;background:${C.bg};border:1px solid ${C.line}">
      <tr>
        <td width="64" style="padding:16px 18px;width:64px;vertical-align:middle">${avatar}</td>
        <td style="padding:16px 18px 16px 0;vertical-align:middle">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.accent}">Din barber</div>
          <div style="font-family:Georgia,serif;font-size:18px;color:${C.cream};margin-top:4px">${escapeHtml(
            b.name,
          )}</div>
          ${title}
        </td>
      </tr>
    </table>`;
}

/** Primær-CTA-knapp (bulletproof, tabell-fri er greit for våre klienter). */
function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr>
      <td style="background:${C.accent}">
        <a href="${href}" style="display:inline-block;background:${C.accent};color:${C.ink};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;padding:14px 26px;letter-spacing:.01em">${label}</a>
      </td>
    </tr></table>`;
}

/**
 * Standardmal: overskrift, intro, detalj-tabell, valgfri CTA/barber-blokk.
 * Beholder den positive signaturen (heading, intro, rows, ctaHtml) så alle
 * eksisterende kallsteder fortsetter å fungere; `opts` er additivt.
 */
function shell(
  heading: string,
  intro: string,
  rows: [string, string][],
  ctaHtml = "",
  opts: { barber?: BarberInfo } = {},
): string {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:12px 16px 12px 0;border-bottom:1px solid ${C.line};color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;vertical-align:top;white-space:nowrap">${k}</td>
           <td style="padding:12px 0;border-bottom:1px solid ${C.line};text-align:right;color:${C.cream};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;vertical-align:top">${v}</td>
         </tr>`,
    )
    .join("");
  const table = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 2px;border-collapse:collapse">${tr}</table>`
    : "";
  const barber = opts.barber && opts.barber.name.trim() ? barberBlock(opts.barber) : "";
  return pageWrap(`
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.28;margin:0 0 14px;color:${C.cream}">${heading}</h1>
    <p style="font-family:Arial,Helvetica,sans-serif;color:${C.soft};line-height:1.7;font-size:15px;margin:0">${intro}</p>
    ${barber}
    ${table}
    ${ctaHtml}`);
}

export async function sendBookingConfirmation(opts: {
  to: string;
  name: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  price: string;
  cancelUrl?: string;
  portalUrl?: string;
  /** Valgfritt: barberens tittel + bilde-URL (vises i barber-blokken). */
  barberTitle?: string;
  barberPhotoUrl?: string;
}): Promise<void> {
  const portalLink = opts.portalUrl
    ? `<p style="margin:18px 0 8px">
         <a href="${opts.portalUrl}"
            style="color:${C.accent};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none">
           Se din side og klippekort →
         </a>
       </p>`
    : "";
  const cancelLink = opts.cancelUrl
    ? `<p style="margin:0 0 6px">
         <a href="${opts.cancelUrl}"
            style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;text-decoration:underline">
           Kan du ikke likevel? Avbestill timen her
         </a>
       </p>`
    : "";
  const cta = portalLink + cancelLink;
  const rows: [string, string][] = [
    ["Tjeneste", escapeHtml(opts.service)],
    ["Dato", escapeHtml(prettyDate(opts.date))],
    ["Tid", escapeHtml(opts.time)],
  ];
  if (opts.price) rows.push(["Pris", escapeHtml(opts.price)]);
  const html = shell(
    "Timen din er bekreftet",
    `Hei ${escapeHtml(opts.name.split(" ")[0])}, vi gleder oss til å se deg. Her er detaljene:`,
    rows,
    cta,
    {
      barber: {
        name: opts.barber,
        title: opts.barberTitle,
        photoUrl: opts.barberPhotoUrl,
      },
    },
  );
  await sendEmail(
    opts.to,
    "Din time hos Downtown Barbers er bekreftet",
    html,
  );
}

/**
 * Varsel til salongen når en kunde booker på nett. Mottaker settes under
 * Admin → Integrasjoner («Varsling ved ny booking»).
 */
export async function sendNewBookingAlert(opts: {
  to: string;
  customer: string;
  phone: string;
  email: string;
  when: string; // f.eks. «Tirsdag 6. oktober kl. 13:00»
  lines: string[]; // «Herreklipp 30' + Voks – Soren»
  note?: string | null;
  calendarUrl: string;
}): Promise<boolean> {
  const rows: [string, string][] = [
    ["Kunde", escapeHtml(opts.customer)],
    ["Telefon", `<a href="tel:${escapeHtml(opts.phone.replace(/[^\d+]/g, ""))}" style="color:${C.cream};text-decoration:none">${escapeHtml(opts.phone)}</a>`],
    ["E-post", escapeHtml(opts.email)],
    ["Når", escapeHtml(opts.when)],
    ["Hva", opts.lines.map(escapeHtml).join("<br>")],
  ];
  if (opts.note) rows.push(["Notat", escapeHtml(opts.note)]);
  const html = shell(
    "Ny booking på nett",
    "En kunde har nettopp booket time. Sjekk at det ser riktig ut i kalenderen:",
    rows,
    ctaButton(opts.calendarUrl, "Åpne kalenderen"),
  );
  return sendEmail(opts.to, `Ny booking: ${opts.customer} – ${opts.when}`, html);
}

/** Kvittering etter fullført/betalt time. */
export async function sendReceiptEmail(opts: {
  to: string;
  name: string;
  service: string;
  barber: string;
  date: string;
  price: string;
  paymentMethod?: string;
  /** Rabatt i kr – egen linje vises kun når > 0. */
  discount?: number;
  /** Splittbetaling: vises som «Kontant 200 kr · Kort 300 kr». */
  payments?: { method: string; amount: number }[];
}): Promise<void> {
  const rows: [string, string][] = [
    ["Tjeneste", escapeHtml(opts.service)],
    ["Barber", escapeHtml(opts.barber)],
    ["Dato", escapeHtml(opts.date)],
  ];
  if (opts.discount && opts.discount > 0) {
    rows.push(["Rabatt", `−${Math.round(opts.discount)} kr`]);
  }
  rows.push(["Betalt", escapeHtml(opts.price)]);
  const paymentLine =
    opts.payments && opts.payments.length > 0
      ? opts.payments
          .map((p) => `${p.method} ${Math.round(p.amount)} kr`)
          .join(" · ")
      : opts.paymentMethod;
  if (paymentLine) rows.push(["Betalingsmåte", escapeHtml(paymentLine)]);
  const html = shell(
    "Kvittering",
    `Hei ${escapeHtml(opts.name.split(" ")[0] || "der")}, takk for besøket! Her er kvitteringen din:`,
    rows,
  );
  await sendEmail(opts.to, "Kvittering – Downtown Barbers", html);
}

/** Varsel når kunden ikke møtte – vennlig, med gebyr-notis og rebooking. */
export async function sendNoShowEmail(opts: {
  to: string;
  name: string;
  service: string;
  barber: string;
  date: string;
  fee?: string; // f.eks. "150 kr" – utelates hvis ikke satt
}): Promise<boolean> {
  const site = siteUrl();
  const rows: [string, string][] = [
    ["Tjeneste", escapeHtml(opts.service)],
    ["Barber", escapeHtml(opts.barber)],
    ["Dato", escapeHtml(opts.date)],
  ];
  if (opts.fee) rows.push(["Gebyr", escapeHtml(opts.fee)]);
  const feeLine = opts.fee
    ? ` For uteblitte timer belastes et gebyr på ${escapeHtml(
        opts.fee,
      )}, som gjøres opp ved neste besøk.`
    : "";
  const html = shell(
    "Vi savnet deg i dag",
    `Hei ${escapeHtml(
      opts.name.split(" ")[0] || "der",
    )}, det ser ut til at du ikke rakk timen din hos oss.${feeLine} Ingen fare – book gjerne en ny tid når det passer.`,
    rows,
    ctaButton(`${site}/booking`, "Book ny time"),
  );
  return sendEmail(opts.to, "Du gikk glipp av timen din – Downtown Barbers", html);
}

export async function sendBookingReminderEmail(opts: {
  to: string;
  name: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  /** Valgfritt: barberens tittel + bilde-URL (vises i barber-blokken). */
  barberTitle?: string;
  barberPhotoUrl?: string;
}): Promise<boolean> {
  const html = shell(
    "Påminnelse om timen din",
    `Hei ${escapeHtml(
      opts.name.split(" ")[0],
    )}, dette er en vennlig påminnelse om timen din i morgen. Trenger du å endre? Ring oss gjerne.`,
    [
      ["Tjeneste", escapeHtml(opts.service)],
      ["Dato", escapeHtml(opts.date)],
      ["Tid", escapeHtml(opts.time)],
    ],
    "",
    {
      barber: {
        name: opts.barber,
        title: opts.barberTitle,
        photoUrl: opts.barberPhotoUrl,
      },
    },
  );
  return sendEmail(
    opts.to,
    "Påminnelse: timen din hos Downtown Barbers",
    html,
  );
}

/** AI-oppfølging: vennlig «book ny time»-e-post med CTA-knapp. */
export async function sendFollowupEmail(opts: {
  to: string;
  name: string;
  subject: string;
  intro: string;
}): Promise<boolean> {
  const site = siteUrl();
  const html = shell(
    escapeHtml(opts.subject),
    escapeHtml(opts.intro),
    [],
    ctaButton(`${site}/booking`, "Bestill ny time"),
  );
  return sendEmail(opts.to, opts.subject, html);
}

/**
 * Innlogging til ansatt: velkommen + midlertidig passord.
 * Brukernavn = e-post. Oppfordrer til å bytte passord via «Glemt passord».
 */
export async function sendStaffCredentialsEmail(opts: {
  to: string;
  name: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
}): Promise<boolean> {
  const cta = `
    ${ctaButton(opts.loginUrl, "Logg inn på ansattportalen")}
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:16px 0 4px">
      Av sikkerhetshensyn bør du bytte passord ved første innlogging: velg
      «Glemt passord?» på innloggingssiden for å sette ditt eget.
    </p>`;
  const html = shell(
    "Velkommen til ansattportalen",
    `Hei ${escapeHtml(
      opts.name.split(" ")[0] || "der",
    )}, du har fått tilgang til ansattportalen hos Downtown Barbers. Logg inn med brukernavnet og det midlertidige passordet nedenfor.`,
    [
      ["Brukernavn (e-post)", escapeHtml(opts.email)],
      ["Midlertidig passord", escapeHtml(opts.tempPassword)],
    ],
    cta,
  );
  return sendEmail(
    opts.to,
    "Din innlogging til Downtown Barbers ansattportal",
    html,
  );
}

/**
 * Tilbakestilling av passord. Sender KUN en lenke (ingen sensitive data).
 * Kalles fra glemt-passord-flyten – svaret til brukeren er alltid nøytralt.
 */
export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
}): Promise<boolean> {
  const cta = `
    ${ctaButton(opts.resetUrl, "Sett nytt passord")}
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:16px 0 0">
      Lenken er gyldig en begrenset periode. Har du ikke bedt om å tilbakestille
      passordet ditt, kan du trygt se bort fra denne e-posten.
    </p>`;
  const html = shell(
    "Tilbakestill passordet ditt",
    "Vi mottok en forespørsel om å tilbakestille passordet for kontoen din. Klikk på knappen nedenfor for å velge et nytt passord.",
    [],
    cta,
  );
  return sendEmail(opts.to, "Tilbakestill passordet – Downtown Barbers", html);
}

/**
 * Passordløs kunde-innlogging: sender lenken til «Min side». Kalles kun når
 * e-posten matcher en eksisterende kunde; server svarer alltid nøytralt.
 */
export async function sendPortalLinkEmail(opts: {
  to: string;
  portalUrl: string;
}): Promise<boolean> {
  const cta = `
    ${ctaButton(opts.portalUrl, "Åpne Min side")}
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:16px 0 0">
      Lenken er personlig – ikke del den. Ba du ikke om denne, kan du trygt se
      bort fra e-posten.
    </p>`;
  const html = shell(
    "Din lenke til Min side",
    "Her er lenken til din side hos Downtown Barbers – der ser du timene dine, kjøpshistorikk og medlemsnivå. Klikk på knappen nedenfor.",
    [],
    cta,
  );
  return sendEmail(opts.to, "Din lenke til Min side – Downtown Barbers", html);
}

/**
 * Lønnslipp til ansatt. Sender en pen varsel-e-post og – når `attachment`
 * finnes – legger lønnslippen ved som en passordbeskyttet ZIP der
 * **passordet er postnummeret** til den ansatte.
 *
 * Uten vedlegg sendes kun et varsel med lenke til portalen (f.eks. når
 * postnummer mangler). Vedlegg sendes via et eget `fetch` mot Resend med
 * `attachments: [{ filename, content: <base64> }]`. Gjenbruker
 * RESEND_API_KEY / fromAddress; hopper stille over hvis nøkkel mangler.
 */
export async function sendPayslipEmail(opts: {
  to: string;
  name: string;
  monthLabel: string;
  attachment?: { filename: string; base64: string };
  portalUrl: string;
}): Promise<boolean> {
  const hasAttachment = !!opts.attachment;
  const intro = hasAttachment
    ? `Hei ${escapeHtml(
        opts.name.split(" ")[0] || "der",
      )}, lønnsoversikten din for ${escapeHtml(
        opts.monthLabel,
      )} er klar. Den ligger vedlagt som en passordbeskyttet ZIP-fil.`
    : `Hei ${escapeHtml(
        opts.name.split(" ")[0] || "der",
      )}, lønnsoversikten din for ${escapeHtml(
        opts.monthLabel,
      )} er klar. Du finner den i ansattportalen.`;

  const passwordNote = hasAttachment
    ? `<p style="color:${C.soft};font-family:Arial,Helvetica,sans-serif;line-height:1.7;font-size:15px;margin:18px 0 0">
         For å åpne ZIP-filen bruker du <strong style="color:${C.cream}">postnummeret ditt</strong> som passord.
       </p>`
    : "";

  const cta = `
    ${passwordNote}
    ${ctaButton(opts.portalUrl, "Se lønnsoversikten i portalen")}
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:16px 0 0">
      Har du spørsmål om lønnen, ta kontakt med salongen.
    </p>`;

  const html = shell(
    `Lønnsoversikt (foreløpig) for ${escapeHtml(opts.monthLabel)}`,
    intro,
    [],
    cta,
  );

  const subject = `Lønnsoversikt (foreløpig) for ${opts.monthLabel} – Downtown Barbers`;

  // Uten vedlegg: gjenbruk den vanlige lav-nivå senderen.
  if (!opts.attachment) {
    return sendEmail(opts.to, subject, html);
  }

  // Med vedlegg: eget fetch mot Resend med attachments.
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to) return false;
  try {
    await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: opts.to,
        subject,
        html,
        attachments: [
          {
            filename: opts.attachment.filename,
            content: opts.attachment.base64,
          },
        ],
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Markedsførings-e-post (DM). Samtykke-først: kalles kun for kunder som
 * har marketing_consent. Hver e-post har en obligatorisk avmeldingslenke.
 */
/** HTML for en markedsførings-e-post (logo, emne som tittel, tekst, «Bestill time», avmelding). */
export function renderMarketingEmail(opts: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
  /** Type utsending – styrer oppsett: 'standard' | 'ny_barber' | 'kampanje'. */
  emailType?: string;
  /** Fremhevet barber (brukes av 'ny_barber'): bilde + egen bestill-knapp. */
  barber?: { name: string; title?: string; photoUrl?: string };
}): string {
  const site = siteUrl();
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="color:${C.soft};font-family:Arial,Helvetica,sans-serif;line-height:1.7;font-size:15px;margin:0 0 16px">${escapeHtml(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  // Fremhevet barber → bilde-blokk + knapp som booker rett til denne barberen.
  const hasBarber = Boolean(opts.barber && opts.barber.name.trim());
  const barberHtml = hasBarber ? barberBlock(opts.barber!) : "";
  const cta = hasBarber
    ? ctaButton(
        `${site}/booking?barber=${encodeURIComponent(opts.barber!.name)}`,
        `Bestill time hos ${escapeHtml(opts.barber!.name.split(" ")[0])}`,
      )
    : ctaButton(
        `${site}/booking`,
        opts.emailType === "kampanje" ? "Se tilbudet" : "Bestill time",
      );

  const inner = `
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.28;margin:0 0 18px;color:${C.cream}">${escapeHtml(
      opts.subject,
    )}</h1>
    ${paragraphs}
    ${barberHtml}
    ${cta}
    <div style="height:1px;background:${C.line};margin:26px 0 14px;font-size:0;line-height:0">&nbsp;</div>
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;margin:0">
      Du får denne e-posten fordi du har sagt ja til tilbud fra oss.
      <a href="${opts.unsubscribeUrl}" style="color:${C.muted};text-decoration:underline">Meld deg av</a>.
    </p>`;
  return pageWrap(inner);
}

export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): Promise<boolean> {
  return sendEmail(opts.to, opts.subject, renderMarketingEmail(opts));
}
