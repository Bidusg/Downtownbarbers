/**
 * E-post via Resend (kun server). Sender kun hvis RESEND_API_KEY finnes –
 * ellers hopper den stille over (så booking fungerer uansett).
 * EMAIL_FROM settes når eget domene er verifisert; faller ellers tilbake
 * til Resend sin testavsender.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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
    await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddress(), to, subject, html }),
    });
    return true;
  } catch {
    return false;
  }
}

function shell(
  heading: string,
  intro: string,
  rows: [string, string][],
  ctaHtml = "",
): string {
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#8a817a">${k}</td><td style="padding:8px 0;text-align:right">${v}</td></tr>`,
    )
    .join("");
  return `
    <div style="font-family:Georgia,serif;background:#211E1A;color:#F8F5EF;padding:40px 24px">
      <div style="max-width:520px;margin:0 auto">
        <p style="letter-spacing:.3em;text-transform:uppercase;color:#F47721;font-size:11px;margin:0 0 8px">
          Downtown Barbers
        </p>
        <h1 style="font-size:26px;margin:0 0 20px">${heading}</h1>
        <p style="color:#cfc7bf;line-height:1.6">${intro}</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">${tr}</table>
        ${ctaHtml}
        <p style="color:#8a817a;font-size:13px">Osterhaus' gate 10, 0183 Oslo · +47 463 58 764</p>
      </div>
    </div>`;
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
}): Promise<void> {
  const portalLink = opts.portalUrl
    ? `<p style="margin:0 0 8px">
         <a href="${opts.portalUrl}"
            style="color:#F47721;font-size:14px;font-weight:600;text-decoration:none">
           Se din side og klippekort →
         </a>
       </p>`
    : "";
  const cancelLink = opts.cancelUrl
    ? `<p style="margin:0 0 24px">
         <a href="${opts.cancelUrl}"
            style="color:#8a817a;font-size:13px;text-decoration:underline">
           Kan du ikke likevel? Avbestill timen her
         </a>
       </p>`
    : "";
  const cta = portalLink + cancelLink;
  const html = shell(
    "Timen din er bekreftet 💈",
    `Hei ${opts.name.split(" ")[0]}, vi gleder oss til å se deg. Her er detaljene:`,
    [
      ["Tjeneste", opts.service],
      ["Barber", opts.barber],
      ["Dato", opts.date],
      ["Tid", opts.time],
      ["Pris", opts.price],
    ],
    cta,
  );
  await sendEmail(
    opts.to,
    "Din time hos Downtown Barbers er bekreftet",
    html,
  );
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
}): Promise<void> {
  const rows: [string, string][] = [
    ["Tjeneste", opts.service],
    ["Barber", opts.barber],
    ["Dato", opts.date],
    ["Betalt", opts.price],
  ];
  if (opts.paymentMethod) rows.push(["Betalingsmåte", opts.paymentMethod]);
  const html = shell(
    "Kvittering 🧾",
    `Hei ${opts.name.split(" ")[0] || "der"}, takk for besøket! Her er kvitteringen din:`,
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
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://downtownbarbers.no";
  const rows: [string, string][] = [
    ["Tjeneste", opts.service],
    ["Barber", opts.barber],
    ["Dato", opts.date],
  ];
  if (opts.fee) rows.push(["Gebyr", opts.fee]);
  const feeLine = opts.fee
    ? ` For uteblitte timer belastes et gebyr på ${opts.fee}, som gjøres opp ved neste besøk.`
    : "";
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:#8a817a">${k}</td><td style="padding:8px 0;text-align:right">${v}</td></tr>`,
    )
    .join("");
  const html = `
    <div style="font-family:Georgia,serif;background:#211E1A;color:#F8F5EF;padding:40px 24px">
      <div style="max-width:520px;margin:0 auto">
        <p style="letter-spacing:.3em;text-transform:uppercase;color:#F47721;font-size:11px;margin:0 0 8px">
          Downtown Barbers
        </p>
        <h1 style="font-size:24px;margin:0 0 18px">Vi savnet deg i dag</h1>
        <p style="color:#cfc7bf;line-height:1.7">Hei ${opts.name.split(" ")[0] || "der"}, det ser ut til at du ikke rakk timen din hos oss.${feeLine} Ingen fare – book gjerne en ny tid når det passer.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">${tr}</table>
        <div style="margin:28px 0">
          <a href="${site}/booking"
             style="display:inline-block;background:#F47721;color:#211E1A;text-decoration:none;font-weight:bold;padding:12px 22px">
            Book ny time
          </a>
        </div>
        <p style="color:#8a817a;font-size:13px">Osterhaus' gate 10, 0183 Oslo · +47 463 58 764</p>
      </div>
    </div>`;
  return sendEmail(opts.to, "Du gikk glipp av timen din – Downtown Barbers", html);
}

export async function sendBookingReminderEmail(opts: {
  to: string;
  name: string;
  service: string;
  barber: string;
  date: string;
  time: string;
}): Promise<boolean> {
  const html = shell(
    "Påminnelse om timen din ⏰",
    `Hei ${opts.name.split(" ")[0]}, dette er en vennlig påminnelse om timen din i morgen. Trenger du å endre? Ring oss gjerne.`,
    [
      ["Tjeneste", opts.service],
      ["Barber", opts.barber],
      ["Dato", opts.date],
      ["Tid", opts.time],
    ],
  );
  return sendEmail(
    opts.to,
    "Påminnelse: timen din hos Downtown Barbers",
    html,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** AI-oppfølging: vennlig «book ny time»-e-post med CTA-knapp. */
export async function sendFollowupEmail(opts: {
  to: string;
  name: string;
  subject: string;
  intro: string;
}): Promise<boolean> {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://downtownbarbers.no";
  const html = `
    <div style="font-family:Georgia,serif;background:#211E1A;color:#F8F5EF;padding:40px 24px">
      <div style="max-width:520px;margin:0 auto">
        <p style="letter-spacing:.3em;text-transform:uppercase;color:#F47721;font-size:11px;margin:0 0 8px">
          Downtown Barbers
        </p>
        <h1 style="font-size:24px;margin:0 0 18px">${escapeHtml(opts.subject)}</h1>
        <p style="color:#cfc7bf;line-height:1.7">${escapeHtml(opts.intro)}</p>
        <div style="margin:28px 0">
          <a href="${site}/booking"
             style="display:inline-block;background:#F47721;color:#211E1A;text-decoration:none;font-weight:bold;padding:12px 22px">
            Bestill ny time
          </a>
        </div>
        <p style="color:#8a817a;font-size:13px">Osterhaus' gate 10, 0183 Oslo · +47 463 58 764</p>
      </div>
    </div>`;
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
    <div style="margin:28px 0">
      <a href="${opts.loginUrl}"
         style="display:inline-block;background:#F47721;color:#211E1A;text-decoration:none;font-weight:bold;padding:12px 22px">
        Logg inn på ansattportalen
      </a>
    </div>
    <p style="color:#8a817a;font-size:13px;line-height:1.6;margin:0 0 4px">
      Av sikkerhetshensyn bør du bytte passord ved første innlogging: velg
      «Glemt passord?» på innloggingssiden for å sette ditt eget.
    </p>`;
  const html = shell(
    "Velkommen til ansattportalen 💈",
    `Hei ${opts.name.split(" ")[0] || "der"}, du har fått tilgang til ansattportalen hos Downtown Barbers. Logg inn med brukernavnet og det midlertidige passordet nedenfor.`,
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
    <div style="margin:28px 0">
      <a href="${opts.resetUrl}"
         style="display:inline-block;background:#F47721;color:#211E1A;text-decoration:none;font-weight:bold;padding:12px 22px">
        Sett nytt passord
      </a>
    </div>
    <p style="color:#8a817a;font-size:13px;line-height:1.6;margin:0">
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
    ? `Hei ${opts.name.split(" ")[0] || "der"}, lønnslippen din for ${escapeHtml(
        opts.monthLabel,
      )} er klar. Den ligger vedlagt som en passordbeskyttet ZIP-fil.`
    : `Hei ${opts.name.split(" ")[0] || "der"}, lønnslippen din for ${escapeHtml(
        opts.monthLabel,
      )} er klar. Du finner den i ansattportalen.`;

  const passwordNote = hasAttachment
    ? `<p style="color:#cfc7bf;line-height:1.7;margin:0 0 8px">
         For å åpne ZIP-filen bruker du <strong>postnummeret ditt</strong> som passord.
       </p>`
    : "";

  const cta = `
    ${passwordNote}
    <div style="margin:28px 0">
      <a href="${opts.portalUrl}"
         style="display:inline-block;background:#F47721;color:#211E1A;text-decoration:none;font-weight:bold;padding:12px 22px">
        Se lønnslippen i portalen
      </a>
    </div>
    <p style="color:#8a817a;font-size:13px;line-height:1.6;margin:0">
      Har du spørsmål om lønnen, ta kontakt med salongen.
    </p>`;

  const html = shell(
    `Lønnslipp for ${escapeHtml(opts.monthLabel)}`,
    intro,
    [],
    cta,
  );

  const subject = `Lønnslipp for ${opts.monthLabel} – Downtown Barbers`;

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
export async function sendMarketingEmail(opts: {
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl: string;
}): Promise<boolean> {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="color:#cfc7bf;line-height:1.7;margin:0 0 16px">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const html = `
    <div style="font-family:Georgia,serif;background:#211E1A;color:#F8F5EF;padding:40px 24px">
      <div style="max-width:520px;margin:0 auto">
        <p style="letter-spacing:.3em;text-transform:uppercase;color:#F47721;font-size:11px;margin:0 0 12px">
          Downtown Barbers
        </p>
        <h1 style="font-size:24px;margin:0 0 20px">${esc(opts.subject)}</h1>
        ${paragraphs}
        <p style="margin:28px 0 0">
          <a href="https://downtownbarbers.no/booking"
             style="display:inline-block;background:#F47721;color:#211E1A;font-weight:bold;
                    text-decoration:none;padding:12px 22px;font-size:14px">Bestill time</a>
        </p>
        <hr style="border:none;border-top:1px solid #3a352f;margin:28px 0 14px">
        <p style="color:#8a817a;font-size:12px;margin:0 0 6px">Osterhaus' gate 10, 0183 Oslo · +47 463 58 764</p>
        <p style="color:#8a817a;font-size:12px;margin:0">
          Du får denne e-posten fordi du har sagt ja til tilbud fra oss.
          <a href="${opts.unsubscribeUrl}" style="color:#8a817a;text-decoration:underline">Meld deg av</a>.
        </p>
      </div>
    </div>`;
  return sendEmail(opts.to, opts.subject, html);
}
