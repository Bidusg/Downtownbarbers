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
