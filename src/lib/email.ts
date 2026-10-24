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
import { staffDisplayName } from "@/lib/staff-display";
import type { Lang } from "@/lib/i18n/dictionary";
import { emailViewUrl, otherLang, type EmailKind } from "@/lib/email-link";
import { fmtDayLang, payMethodLang, translateServiceText } from "@/lib/i18n/server-lang";
import { methodLabel } from "@/lib/format";

/* ---- Faste tekster i kunde-e-postene (norsk / engelsk) ------------------ */
const L = {
  no: {
    yourBarber: "Din barber", directions: "Veibeskrivelse", call: "Ring oss",
    service: "Tjeneste", date: "Dato", time: "Tid", price: "Pris", barber: "Barber",
    discount: "Rabatt", paid: "Betalt", payMethod: "Betalingsmåte", fee: "Gebyr",
    there: "der", products: "Varekjøp", appointment: "time",
    switchTo: "Read in English →",
  },
  en: {
    yourBarber: "Your barber", directions: "Directions", call: "Call us",
    service: "Service", date: "Date", time: "Time", price: "Price", barber: "Barber",
    discount: "Discount", paid: "Paid", payMethod: "Payment", fee: "Fee",
    there: "there", products: "Products", appointment: "appointment",
    switchTo: "Les på norsk →",
  },
} as const;
const tx = (lang: Lang | undefined) => L[lang === "en" ? "en" : "no"];

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
function prettyDate(d: string, lang: Lang = "no"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "nb-NO", {
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
function footerHtml(lang: Lang = "no"): string {
  const w = tx(lang);
  return `
      <tr><td style="padding:4px 32px 0">
        <div style="height:1px;background:${C.line};margin:26px 0 0;font-size:0;line-height:0">&nbsp;</div>
      </td></tr>
      <tr><td align="center" style="padding:22px 32px 2px">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
          <td style="padding:0 5px">
            <a href="${MAPS_URL}" style="display:inline-block;border:1px solid ${C.line};color:${C.cream};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:11px 18px">${w.directions}</a>
          </td>
          <td style="padding:0 5px">
            <a href="tel:${TEL}" style="display:inline-block;border:1px solid ${C.line};color:${C.cream};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;padding:11px 18px">${w.call}</a>
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
function pageWrap(inner: string, lang: Lang = "no", switchUrl?: string | null): string {
  const site = siteUrl();
  // Språkvalg øverst til høyre: åpner samme e-post på det andre språket.
  const langRow = switchUrl
    ? `<tr><td align="right" style="padding:14px 18px 0">
          <a href="${escapeHtml(switchUrl)}" lang="${lang === "en" ? "nb" : "en"}" style="display:inline-block;border:1px solid ${C.line};font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:${C.accent};text-decoration:none;padding:6px 12px;letter-spacing:.02em">${tx(lang).switchTo}</a>
        </td></tr>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang === "en" ? "en" : "nb"}" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light;supported-color-schemes:light}</style></head>
<body bgcolor="${C.bg}" style="margin:0;padding:0;background:${C.bg};background-color:${C.bg};-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background:${C.bg};background-color:${C.bg}">
    <tr><td align="center" bgcolor="${C.bg}" style="padding:30px 14px;background-color:${C.bg}">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${C.card}" class="card" style="width:600px;max-width:100%;background:${C.card};background-color:${C.card};border:1px solid ${C.line}">
${langRow}
        <tr><td align="center" style="padding:${switchUrl ? "12px" : "38px"} 32px 0">
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
${footerHtml(lang)}
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

function barberBlock(b: BarberInfo, lang: Lang = "no"): string {
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
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.accent}">${tx(lang).yourBarber}</div>
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
  opts: { barber?: BarberInfo; lang?: Lang; switchUrl?: string | null } = {},
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
  const barber = opts.barber && opts.barber.name.trim() ? barberBlock(opts.barber, opts.lang) : "";
  return pageWrap(`
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.28;margin:0 0 14px;color:${C.cream}">${heading}</h1>
    <p style="font-family:Arial,Helvetica,sans-serif;color:${C.soft};line-height:1.7;font-size:15px;margin:0">${intro}</p>
    ${barber}
    ${table}
    ${ctaHtml}`, opts.lang, opts.switchUrl);
}

/* =====================================================================
 * KUNDE-E-POSTER MED SPRÅKVALG
 *   Hver e-post lages av en render-funksjon som tar RÅDATA (norske
 *   tjenestenavn, ISO-dato, betalingsmåte-nøkler) og et språk. Da kan samme
 *   e-post lages på nytt på det andre språket når kunden trykker «Read in
 *   English» / «Les på norsk» (se /e/[t] og email-link.ts).
 * ===================================================================== */

type Rendered = { subject: string; html: string };

/** «2026-10-05» eller ISO-tid → «Mandag 5. oktober …»; annen tekst uendret. */
function dayText(d: string, lang: Lang): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return prettyDate(d, lang);
  if (/^\d{4}-\d{2}-\d{2}T/.test(d)) {
    const t = fmtDayLang(d, lang);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  return d;
}

async function serviceText(s: string | undefined, lang: Lang, fallback: string): Promise<string> {
  const v = (s ?? "").trim();
  return v ? translateServiceText(v, lang) : fallback;
}

/** Send en kunde-e-post med språklenke (lenken viser den på det andre språket). */
async function sendLocalized(
  kind: EmailKind,
  to: string,
  data: Record<string, unknown>,
  lang: Lang,
  ttlMs?: number,
): Promise<boolean> {
  if (!to) return false;
  const switchUrl = emailViewUrl(kind, data, otherLang(lang), to, ttlMs);
  const r = await renderEmailView(kind, data, lang, switchUrl);
  if (!r) return false;
  return sendEmail(to, r.subject, r.html);
}

/* ---- Bookingbekreftelse ------------------------------------------------ */
export type BookingConfirmationData = {
  name: string;
  /** Norsk tjenestenavn (oversettes for engelsk). */
  service: string;
  barber: string;
  /** Flere barbere (gruppebooking) – barber-blokken viser «Flere barbere». */
  group?: boolean;
  /** «YYYY-MM-DD» eller ISO-tid. */
  date: string;
  time: string;
  price?: string;
  cancelUrl?: string;
  portalUrl?: string;
  /** Valgfritt: barberens tittel + bilde-URL (vises i barber-blokken). */
  barberTitle?: string;
  barberPhotoUrl?: string;
};

async function renderBookingConfirmation(
  d: BookingConfirmationData,
  lang: Lang,
  switchUrl?: string | null,
): Promise<Rendered> {
  const en = lang === "en";
  const w = tx(lang);
  const barber = d.group ? (en ? "Several barbers" : "Flere barbere") : await staffDisplayName(d.barber);
  const portalLink = d.portalUrl
    ? `<p style="margin:18px 0 8px">
         <a href="${escapeHtml(d.portalUrl)}"
            style="color:${C.accent};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none">
           ${en ? "See your page and punch card →" : "Se din side og klippekort →"}
         </a>
       </p>`
    : "";
  const cancelLink = d.cancelUrl
    ? `<p style="margin:0 0 6px">
         <a href="${escapeHtml(d.cancelUrl)}"
            style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;text-decoration:underline">
           ${en ? "Can't make it after all? Cancel your appointment here" : "Kan du ikke likevel? Avbestill timen her"}
         </a>
       </p>`
    : "";
  const rows: [string, string][] = [
    [w.service, escapeHtml(await serviceText(d.service, lang, w.appointment))],
    [w.date, escapeHtml(dayText(d.date, lang))],
    [w.time, escapeHtml(d.time)],
  ];
  if (d.price) rows.push([w.price, escapeHtml(d.price)]);
  const first = escapeHtml(d.name.split(" ")[0] || w.there);
  const html = shell(
    en ? "Your appointment is confirmed" : "Timen din er bekreftet",
    en
      ? `Hi ${first}, we look forward to seeing you. Here are the details:`
      : `Hei ${first}, vi gleder oss til å se deg. Her er detaljene:`,
    rows,
    portalLink + cancelLink,
    {
      barber: { name: barber, title: d.group ? undefined : d.barberTitle, photoUrl: d.group ? undefined : d.barberPhotoUrl },
      lang,
      switchUrl,
    },
  );
  return {
    subject: en ? "Your appointment at Downtown Barbers is confirmed" : "Din time hos Downtown Barbers er bekreftet",
    html,
  };
}

export async function sendBookingConfirmation(
  opts: BookingConfirmationData & { to: string; lang?: Lang },
): Promise<void> {
  const { to, lang, ...d } = opts;
  await sendLocalized("bc", to, d, lang === "en" ? "en" : "no");
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

/* ---- Kvittering -------------------------------------------------------- */
export type ReceiptData = {
  name: string;
  /** Norsk tjenestenavn; tom = varekjøp. */
  service: string;
  barber: string;
  /** ISO-tid (eller ferdig tekst). */
  date: string;
  price: string;
  /** Betalingsmåte-nøkkel (kontant, kort …) – oversettes for engelsk. */
  paymentMethod?: string;
  /** Rabatt i kr – egen linje vises kun når > 0. */
  discount?: number;
  /** Splittbetaling: vises som «Kontant 200 kr · Kort 300 kr». */
  payments?: { method: string; amount: number }[];
};

async function renderReceipt(d: ReceiptData, lang: Lang, switchUrl?: string | null): Promise<Rendered> {
  const en = lang === "en";
  const w = tx(lang);
  const barber = await staffDisplayName(d.barber);
  const rows: [string, string][] = [[w.service, escapeHtml(await serviceText(d.service, lang, w.products))]];
  if (barber) rows.push([w.barber, escapeHtml(barber)]);
  rows.push([w.date, escapeHtml(dayText(d.date, lang))]);
  if (d.discount && d.discount > 0) rows.push([w.discount, `−${Math.round(d.discount)} kr`]);
  rows.push([w.paid, escapeHtml(d.price)]);
  const method = (m: string) => (lang === "en" ? payMethodLang(methodLabel(m), "en") : methodLabel(m));
  const paymentLine =
    d.payments && d.payments.length > 0
      ? d.payments.map((p) => `${method(p.method)} ${Math.round(p.amount)} kr`).join(" · ")
      : d.paymentMethod
        ? method(d.paymentMethod)
        : "";
  if (paymentLine) rows.push([w.payMethod, escapeHtml(paymentLine)]);
  const first = escapeHtml(d.name.split(" ")[0] || w.there);
  const html = shell(
    en ? "Receipt" : "Kvittering",
    en
      ? `Hi ${first}, thanks for visiting! Here is your receipt:`
      : `Hei ${first}, takk for besøket! Her er kvitteringen din:`,
    rows,
    "",
    { lang, switchUrl },
  );
  return { subject: en ? "Receipt – Downtown Barbers" : "Kvittering – Downtown Barbers", html };
}

/** Kvittering etter fullført/betalt time eller hurtigsalg. */
export async function sendReceiptEmail(opts: ReceiptData & { to: string; lang?: Lang }): Promise<void> {
  const { to, lang, ...d } = opts;
  await sendLocalized("rc", to, d, lang === "en" ? "en" : "no");
}

/* ---- Ikke møtt --------------------------------------------------------- */
export type NoShowData = {
  name: string;
  service: string;
  barber: string;
  date: string;
  fee?: string; // f.eks. "150 kr" – utelates hvis ikke satt
};

async function renderNoShow(d: NoShowData, lang: Lang, switchUrl?: string | null): Promise<Rendered> {
  const en = lang === "en";
  const w = tx(lang);
  const site = siteUrl();
  const barber = await staffDisplayName(d.barber);
  const rows: [string, string][] = [[w.service, escapeHtml(await serviceText(d.service, lang, w.appointment))]];
  if (barber) rows.push([w.barber, escapeHtml(barber)]);
  rows.push([w.date, escapeHtml(dayText(d.date, lang))]);
  if (d.fee) rows.push([w.fee, escapeHtml(d.fee)]);
  const fee = d.fee ? escapeHtml(d.fee) : "";
  const feeLine = fee
    ? en
      ? ` A fee of ${fee} applies to missed appointments and is settled at your next visit.`
      : ` For uteblitte timer belastes et gebyr på ${fee}, som gjøres opp ved neste besøk.`
    : "";
  const first = escapeHtml(d.name.split(" ")[0] || w.there);
  const html = shell(
    en ? "We missed you today" : "Vi savnet deg i dag",
    en
      ? `Hi ${first}, it looks like you couldn't make your appointment with us.${feeLine} No worries – book a new time whenever it suits you.`
      : `Hei ${first}, det ser ut til at du ikke rakk timen din hos oss.${feeLine} Ingen fare – book gjerne en ny tid når det passer.`,
    rows,
    ctaButton(`${site}/booking`, en ? "Book a new appointment" : "Book ny time"),
    { lang, switchUrl },
  );
  return {
    subject: en ? "You missed your appointment – Downtown Barbers" : "Du gikk glipp av timen din – Downtown Barbers",
    html,
  };
}

/** Varsel når kunden ikke møtte – vennlig, med gebyr-notis og rebooking. */
export async function sendNoShowEmail(opts: NoShowData & { to: string; lang?: Lang }): Promise<boolean> {
  const { to, lang, ...d } = opts;
  return sendLocalized("ns", to, d, lang === "en" ? "en" : "no");
}

/* ---- Påminnelse dagen før ---------------------------------------------- */
export type ReminderData = {
  name: string;
  service: string;
  /** Tom = ingen barber-blokk. */
  barber: string;
  date: string;
  time: string;
  barberTitle?: string;
  barberPhotoUrl?: string;
};

async function renderReminder(d: ReminderData, lang: Lang, switchUrl?: string | null): Promise<Rendered> {
  const en = lang === "en";
  const w = tx(lang);
  const barber = d.barber ? await staffDisplayName(d.barber) : "";
  const first = escapeHtml(d.name.split(" ")[0] || w.there);
  const html = shell(
    en ? "Reminder about your appointment" : "Påminnelse om timen din",
    en
      ? `Hi ${first}, this is a friendly reminder about your appointment tomorrow. Need to change it? Feel free to call us.`
      : `Hei ${first}, dette er en vennlig påminnelse om timen din i morgen. Trenger du å endre? Ring oss gjerne.`,
    [
      [w.service, escapeHtml(await serviceText(d.service, lang, w.appointment))],
      [w.date, escapeHtml(dayText(d.date, lang))],
      [w.time, escapeHtml(d.time)],
    ],
    "",
    {
      barber: barber ? { name: barber, title: d.barberTitle, photoUrl: d.barberPhotoUrl } : undefined,
      lang,
      switchUrl,
    },
  );
  return {
    subject: en ? "Reminder: your appointment at Downtown Barbers" : "Påminnelse: timen din hos Downtown Barbers",
    html,
  };
}

export async function sendBookingReminderEmail(opts: ReminderData & { to: string; lang?: Lang }): Promise<boolean> {
  const { to, lang, ...d } = opts;
  return sendLocalized("rm", to, d, lang === "en" ? "en" : "no");
}

/**
 * Daglig påminnelse til ansvarlig når ett eller flere dagsoppgjør mangler
 * bekreftelse (løsning D). Gjenbruker den felles e-postmalen (shell) og
 * samme mottaker som booking-varslingen (settings.booking_notify).
 */
export async function sendSettlementReminderEmail(opts: {
  to: string;
  days: { date: string; salesTotal: number }[];
}): Promise<boolean> {
  if (!opts.to || opts.days.length === 0) return false;
  const site = siteUrl();
  const rows: [string, string][] = opts.days.map((d) => [
    escapeHtml(prettyDate(d.date)),
    `${Math.round(d.salesTotal).toLocaleString("nb-NO")} kr registrert salg`,
  ]);
  const n = opts.days.length;
  const intro =
    n === 1
      ? "Det er registrert salg på én dag uten et bekreftet kasseoppgjør. Regnskapet blir feil til opptellingen er bekreftet. Gå inn og bekreft så snart som mulig:"
      : `Det er registrert salg på ${n} dager uten bekreftet kasseoppgjør. Regnskapet blir feil til opptellingen er bekreftet. Gå inn og bekreft så snart som mulig:`;
  const html = shell(
    "Kasseoppgjør mangler bekreftelse",
    intro,
    rows,
    ctaButton(`${site}/admin/kasseoppgjor`, "Åpne kasseoppgjør"),
  );
  return sendEmail(
    opts.to,
    n === 1
      ? "Kasseoppgjør mangler – bekreft dagens oppgjør"
      : `Kasseoppgjør mangler for ${n} dager – bekreft`,
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

/* ---- Lenke til Min side ------------------------------------------------ */
type PortalLinkData = { portalUrl: string };

async function renderPortalLink(d: PortalLinkData, lang: Lang, switchUrl?: string | null): Promise<Rendered> {
  const en = lang === "en";
  const cta = `
    ${ctaButton(escapeHtml(d.portalUrl), en ? "Open My page" : "Åpne Min side")}
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:16px 0 0">
      ${
        en
          ? "This link is personal – don't share it. If you didn't ask for it, you can safely ignore this email."
          : "Lenken er personlig – ikke del den. Ba du ikke om denne, kan du trygt se bort fra e-posten."
      }
    </p>`;
  const html = shell(
    en ? "Your link to My page" : "Din lenke til Min side",
    en
      ? "Here is the link to your page at Downtown Barbers – where you'll find your appointments, purchase history and membership level. Click the button below."
      : "Her er lenken til din side hos Downtown Barbers – der ser du timene dine, kjøpshistorikk og medlemsnivå. Klikk på knappen nedenfor.",
    [],
    cta,
    { lang, switchUrl },
  );
  return {
    subject: en ? "Your link to My page – Downtown Barbers" : "Din lenke til Min side – Downtown Barbers",
    html,
  };
}

/**
 * Passordløs kunde-innlogging: sender lenken til «Min side». Kalles kun når
 * e-posten matcher en eksisterende kunde; server svarer alltid nøytralt.
 */
export async function sendPortalLinkEmail(opts: { to: string; portalUrl: string; lang?: Lang }): Promise<boolean> {
  return sendLocalized("pl", opts.to, { portalUrl: opts.portalUrl }, opts.lang === "en" ? "en" : "no", 7 * 24 * 3600_000);
}

/* ---- Engangskode ------------------------------------------------------- */
type LoginCodeData = { code: string; portalUrl?: string; welcome?: boolean };

async function renderLoginCode(d: LoginCodeData, lang: Lang, switchUrl?: string | null): Promise<Rendered> {
  const en = lang === "en";
  const codeHtml = `
    <div style="margin:24px 0 8px;text-align:center">
      <div style="display:inline-block;background:${C.bg};border:1px solid ${C.line};padding:16px 26px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;letter-spacing:.32em;color:${C.cream}">${escapeHtml(d.code)}</div>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.muted};margin:12px 0 0">
        ${en ? "The code is valid for 10 minutes." : "Koden gjelder i 10 minutter."}
      </p>
    </div>
    ${d.portalUrl ? ctaButton(escapeHtml(d.portalUrl), en ? "Or open My page directly" : "Eller åpne Min side direkte") : ""}
    <p style="color:${C.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;margin:16px 0 0">
      ${
        en
          ? "Didn't ask for this? You can safely ignore this email – nobody can log in without the code."
          : "Ba du ikke om dette? Da kan du trygt se bort fra e-posten – ingen kommer inn uten koden."
      }
    </p>`;
  const html = shell(
    d.welcome
      ? en ? "Welcome to Downtown Barbers" : "Velkommen til Downtown Barbers"
      : en ? "Your login code" : "Din innloggingskode",
    d.welcome
      ? en
        ? "Your account is ready. Enter this code to log in – after that you stay logged in on this device."
        : "Kontoen din er klar. Skriv inn koden for å logge inn – etterpå forblir du innlogget på denne enheten."
      : en
        ? "Enter this code to log in to My page:"
        : "Skriv inn denne koden for å logge inn på Min side:",
    [],
    codeHtml,
    { lang, switchUrl },
  );
  return {
    subject: en ? `${d.code} is your login code – Downtown Barbers` : `${d.code} er innloggingskoden din – Downtown Barbers`,
    html,
  };
}

/**
 * Engangskode for kunde-innlogging (6 siffer, gyldig 10 min). Inneholder også
 * en direkte knapp til Min side for dem som heller vil trykke.
 */
export async function sendLoginCodeEmail(opts: {
  to: string;
  code: string;
  portalUrl?: string;
  lang?: Lang;
  /** Ny konto (registrering) – litt annen velkomsttekst. */
  welcome?: boolean;
}): Promise<boolean> {
  const { to, lang, ...d } = opts;
  // Språklenken trengs bare så lenge koden gjelder.
  return sendLocalized("lc", to, d, lang === "en" ? "en" : "no", 30 * 60_000);
}

/** Lag en kunde-e-post på nytt (språklenken). Markedsføring håndteres i /e/[t]. */
export async function renderEmailView(
  kind: EmailKind,
  data: Record<string, unknown>,
  lang: Lang,
  switchUrl?: string | null,
): Promise<Rendered | null> {
  try {
    switch (kind) {
      case "bc": return await renderBookingConfirmation(data as BookingConfirmationData, lang, switchUrl);
      case "rc": return await renderReceipt(data as ReceiptData, lang, switchUrl);
      case "ns": return await renderNoShow(data as NoShowData, lang, switchUrl);
      case "rm": return await renderReminder(data as ReminderData, lang, switchUrl);
      case "pl": return await renderPortalLink(data as PortalLinkData, lang, switchUrl);
      case "lc": return await renderLoginCode(data as LoginCodeData, lang, switchUrl);
      default: return null;
    }
  } catch {
    return null;
  }
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
      )} er klar. Den ligger under Dokumenter på Min side – logg inn med ansattkontoen din for å se og laste den ned.`;

  const passwordNote = hasAttachment
    ? `<p style="color:${C.soft};font-family:Arial,Helvetica,sans-serif;line-height:1.7;font-size:15px;margin:18px 0 0">
         For å åpne ZIP-filen bruker du <strong style="color:${C.cream}">postnummeret ditt</strong> som passord.
       </p>`
    : "";

  const cta = `
    ${passwordNote}
    ${ctaButton(opts.portalUrl, hasAttachment ? "Se lønnsoversikten i portalen" : "Åpne lønnsoversikten")}
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
export type MarketingBarber = {
  name: string;
  displayName?: string;
  title?: string;
  photoUrl?: string;
  /** Bilder av arbeidet + lenke til hele galleriet (barbersiden). */
  gallery?: { images: string[]; url: string };
};

/**
 * Bilder av arbeidet i e-post: 2×2 rutenett (maks 4) som lenker til hele
 * galleriet på nettsiden, der kunden kan bla med «neste/forrige».
 * (Ekte karusell inne i e-posten virker ikke i Gmail/Outlook.)
 */
function galleryBlock(g: { images: string[]; url: string }, first: string, lang: Lang = "no"): string {
  const en = lang === "en";
  const imgs = g.images.slice(0, 4);
  if (!imgs.length) return "";
  const cell = (src: string) =>
    `<td width="50%" style="padding:4px;width:50%"><a href="${escapeHtml(g.url)}" style="text-decoration:none"><img src="${escapeHtml(
      src,
    )}" width="262" alt="${en ? "Cut by" : "Klipp av"} ${escapeHtml(first)}" style="display:block;width:100%;max-width:262px;height:auto;aspect-ratio:1/1;object-fit:cover;border:0;border-radius:6px"></a></td>`;
  const rows: string[] = [];
  for (let i = 0; i < imgs.length; i += 2) {
    rows.push(`<tr>${cell(imgs[i])}${imgs[i + 1] ? cell(imgs[i + 1]) : '<td width="50%"></td>'}</tr>`);
  }
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.accent};margin:22px 0 8px">${en ? `Some of ${escapeHtml(first)}'s work` : `Noe av arbeidet til ${escapeHtml(first)}`}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 -4px">${rows.join("")}</table>
    <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px">
      <a href="${escapeHtml(g.url)}" style="color:${C.accent};font-weight:bold;text-decoration:none">${en ? `See more of ${escapeHtml(first)}'s cuts →` : `Se flere av ${escapeHtml(first)}s klipp →`}</a>
    </p>`;
}

export function renderMarketingEmail(opts: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
  /** Type utsending – styrer oppsett: 'standard' | 'ny_barber' | 'kampanje'. */
  emailType?: string;
  /** Fremhevet barber (brukes av 'ny_barber'): bilde + egen bestill-knapp. */
  barber?: MarketingBarber;
  /** Flere fremhevede barbere – hver får eget kort + «Bestill hos …»-knapp. */
  barbers?: MarketingBarber[];
  /** Språket teksten er på (styrer faste tekster som knapper og avmelding). */
  lang?: Lang;
  /** Lenke til samme utsending på det andre språket (når den finnes). */
  switchUrl?: string | null;
}): string {
  const site = siteUrl();
  const lang: Lang = opts.lang === "en" ? "en" : "no";
  const en = lang === "en";
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="color:${C.soft};font-family:Arial,Helvetica,sans-serif;line-height:1.7;font-size:15px;margin:0 0 16px">${escapeHtml(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  // Fremhevede barbere → ett bilde-kort + egen bestill-knapp per barber.
  // Bakoverkompatibelt: `barber` (én) tolkes som en liste på én.
  const list = (
    opts.barbers && opts.barbers.length
      ? opts.barbers
      : opts.barber
        ? [opts.barber]
        : []
  ).filter((b) => b && b.name.trim());
  const hasBarber = list.length > 0;
  // Visningsnavn i teksten (displayName), fullt navn i bestill-lenken.
  const barberHtml = hasBarber
    ? list
        .map(
          (b) =>
            barberBlock({ ...b, name: b.displayName?.trim() || b.name }, lang) +
            (b.gallery ? galleryBlock(b.gallery, (b.displayName?.trim() || b.name).split(" ")[0], lang) : "") +
            ctaButton(
              `${site}/booking?barber=${encodeURIComponent(b.name)}`,
              `${en ? "Book with" : "Bestill time hos"} ${escapeHtml((b.displayName?.trim() || b.name).split(" ")[0])}`,
            ),
        )
        .join("")
    : "";
  const cta = hasBarber
    ? ""
    : ctaButton(
        `${site}/booking`,
        opts.emailType === "kampanje" ? (en ? "See the offer" : "Se tilbudet") : en ? "Book now" : "Bestill time",
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
      ${en ? "You're receiving this email because you agreed to hear about offers from us." : "Du får denne e-posten fordi du har sagt ja til tilbud fra oss."}
      <a href="${opts.unsubscribeUrl}" style="color:${C.muted};text-decoration:underline">${en ? "Unsubscribe" : "Meld deg av"}</a>.
    </p>`;
  return pageWrap(inner, lang, opts.switchUrl);
}

export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): Promise<boolean> {
  return sendEmail(opts.to, opts.subject, renderMarketingEmail(opts));
}
