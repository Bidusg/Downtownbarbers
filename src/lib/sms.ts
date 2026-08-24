/**
 * SMS via Twilio (kun server). Sender kun hvis Twilio-variablene finnes –
 * ellers hopper den stille over, akkurat som e-post. Slik virker påminnelser
 * på e-post uansett, og SMS slås på så snart Twilio-konto er satt opp.
 *
 * Miljøvariabler:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (avsendernr/alfanumerisk)
 */

/** Gjør et norsk nummer om til E.164 (+47…). Tomt hvis ugyldig. */
export function toE164(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  const local = cleaned.replace(/^(\+47|0047|47)/, "");
  if (/^\d{8}$/.test(local)) return `+47${local}`;
  return "";
}

/** Returnerer true hvis forsøkt sendt, false hvis hoppet over / feilet. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const dest = toE164(to);
  if (!sid || !token || !from || !dest) return false;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: dest, From: from, Body: body }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
