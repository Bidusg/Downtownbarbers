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

export async function sendBookingConfirmation(opts: {
  to: string;
  name: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  price: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to) return; // ingen nøkkel → hopp over, ikke blokker booking

  const html = `
    <div style="font-family:Georgia,serif;background:#211E1A;color:#F8F5EF;padding:40px 24px">
      <div style="max-width:520px;margin:0 auto">
        <p style="letter-spacing:.3em;text-transform:uppercase;color:#F47721;font-size:11px;margin:0 0 8px">
          Downtown Barbers
        </p>
        <h1 style="font-size:26px;margin:0 0 20px">Timen din er bekreftet 💈</h1>
        <p style="color:#cfc7bf;line-height:1.6">Hei ${opts.name.split(" ")[0]},</p>
        <p style="color:#cfc7bf;line-height:1.6">Vi gleder oss til å se deg. Her er detaljene:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px 0;color:#8a817a">Tjeneste</td><td style="padding:8px 0;text-align:right">${opts.service}</td></tr>
          <tr><td style="padding:8px 0;color:#8a817a">Barber</td><td style="padding:8px 0;text-align:right">${opts.barber}</td></tr>
          <tr><td style="padding:8px 0;color:#8a817a">Dato</td><td style="padding:8px 0;text-align:right">${opts.date}</td></tr>
          <tr><td style="padding:8px 0;color:#8a817a">Tid</td><td style="padding:8px 0;text-align:right">${opts.time}</td></tr>
          <tr><td style="padding:8px 0;color:#8a817a">Pris</td><td style="padding:8px 0;text-align:right">${opts.price}</td></tr>
        </table>
        <p style="color:#8a817a;font-size:13px">Osterhaus' gate 10, 0183 Oslo · +47 463 58 764</p>
      </div>
    </div>`;

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
        subject: "Din time hos Downtown Barbers er bekreftet",
        html,
      }),
    });
  } catch {
    // ikke la e-postfeil stoppe bookingen
  }
}
