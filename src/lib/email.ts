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

function shell(heading: string, intro: string, rows: [string, string][]): string {
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
}): Promise<void> {
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
