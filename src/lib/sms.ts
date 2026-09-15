/**
 * SMS-lag – leverandør-uavhengig, laget for A2P-leverandører (bedrift-SMS med
 * eget avsendernavn). Sender kun hvis en leverandør er konfigurert via env –
 * ellers hoppes det stille over, akkurat som e-post. Slik virker påminnelser
 * uansett, og SMS slås på når nøklene er satt i Vercel.
 *
 * Velg leverandør med SMS_PROVIDER (ellers gjettes den fra hvilke nøkler som
 * finnes). Avsendernavn settes med SMS_SENDER (f.eks. "Downtown").
 *
 *   GatewayAPI (anbefalt, nordisk, billig):
 *     SMS_PROVIDER=gatewayapi · GATEWAYAPI_TOKEN=… · SMS_SENDER=Downtown
 *   Sveve (norsk):
 *     SMS_PROVIDER=sveve · SVEVE_USER=… · SVEVE_PASSWORD=… · SMS_SENDER=Downtown
 *   Twilio:
 *     SMS_PROVIDER=twilio · TWILIO_ACCOUNT_SID=… · TWILIO_AUTH_TOKEN=… · TWILIO_FROM=…
 *   Generisk HTTP (hvilken som helst A2P-API med bearer + JSON):
 *     SMS_PROVIDER=generic · SMS_API_URL=… · SMS_API_KEY=… · SMS_SENDER=Downtown
 */

type Provider = "gatewayapi" | "sveve" | "twilio" | "generic" | "";

function provider(): Provider {
  const p = process.env.SMS_PROVIDER?.toLowerCase();
  if (p === "gatewayapi" || p === "sveve" || p === "twilio" || p === "generic")
    return p;
  // Gjett fra tilgjengelige nøkler (bakoverkompatibelt med Twilio).
  if (process.env.GATEWAYAPI_TOKEN) return "gatewayapi";
  if (process.env.SVEVE_USER && process.env.SVEVE_PASSWORD) return "sveve";
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return "twilio";
  if (process.env.SMS_API_URL) return "generic";
  return "";
}

function senderName(): string {
  return process.env.SMS_SENDER || process.env.TWILIO_FROM || "Downtown";
}

export function isSmsConfigured(): boolean {
  return provider() !== "";
}

/* ---------------- Innkommende (STOPP/START) ---------------- */

export type InboundAction = "stop" | "start" | "other";

// Reservasjon (av) og påmelding (på). Norsk + engelsk, tåler småskriving.
const STOP_WORDS = new Set([
  "STOPP", "STOP", "SLUTT", "STANS", "AVMELD", "AVMELDING", "AVBESTILL",
  "AVSLUTT", "UNSUBSCRIBE", "STOPPE", "FJERN", "NEI",
]);
const START_WORDS = new Set([
  "START", "JA", "JATAKK", "PÅMELD", "PAMELD", "SUBSCRIBE", "MELD", "STARTE",
]);

/**
 * Klassifiser en innkommende SMS ut fra første ord. Robust mot tegnsetting
 * og store/små bokstaver, f.eks. «Stopp!», «STOPP takk», «ja» → stop/start.
 */
export function classifyInbound(body: string): InboundAction {
  const first = (body ?? "").trim().split(/\s+/)[0] ?? "";
  const kw = first.toUpperCase().replace(/[^A-ZÆØÅ]/g, "");
  if (!kw) return "other";
  if (STOP_WORDS.has(kw)) return "stop";
  if (START_WORDS.has(kw)) return "start";
  return "other";
}

/** Gjør et norsk nummer om til E.164 (+47…). Tomt hvis ugyldig. */
export function toE164(phone: string): string {
  const cleaned = (phone ?? "").replace(/[\s-]/g, "");
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  const local = cleaned.replace(/^(\+47|0047|47)/, "");
  if (/^\d{8}$/.test(local)) return `+47${local}`;
  return "";
}

/* ---------------- Leverandør-drivere ---------------- */

async function viaGatewayApi(dests: string[], body: string): Promise<number> {
  const token = process.env.GATEWAYAPI_TOKEN!;
  const recipients = dests
    .map((d) => Number(d.replace("+", "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((msisdn) => ({ msisdn }));
  if (recipients.length === 0) return 0;
  try {
    const res = await fetch("https://gatewayapi.com/rest/mtsms", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${token}:`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sender: senderName(), message: body, recipients }),
    });
    return res.ok ? recipients.length : 0;
  } catch {
    return 0;
  }
}

async function viaSveve(dests: string[], body: string): Promise<number> {
  const user = process.env.SVEVE_USER!;
  const passwd = process.env.SVEVE_PASSWORD!;
  try {
    const res = await fetch("https://sveve.no/SMS/SendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        user,
        passwd,
        from: senderName(),
        to: dests.join(","),
        msg: body,
      }),
    });
    return res.ok ? dests.length : 0;
  } catch {
    return 0;
  }
}

async function viaTwilio(dest: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM || senderName();
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
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

async function viaGeneric(dest: string, body: string): Promise<boolean> {
  const url = process.env.SMS_API_URL!;
  const key = process.env.SMS_API_KEY;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ to: dest, from: senderName(), message: body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------------- Offentlig API ---------------- */

/** Send én SMS. Returnerer true hvis forsøkt sendt OK, false hvis hoppet over/feilet. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const dest = toE164(to);
  if (!dest || !body?.trim()) return false;
  switch (provider()) {
    case "gatewayapi":
      return (await viaGatewayApi([dest], body)) > 0;
    case "sveve":
      return (await viaSveve([dest], body)) > 0;
    case "twilio":
      return viaTwilio(dest, body);
    case "generic":
      return viaGeneric(dest, body);
    default:
      return false; // ingen leverandør konfigurert
  }
}

/**
 * Send samme melding til mange mottakere. Bruker leverandørens bulk-endepunkt
 * der det finnes (GatewayAPI/Sveve tar hele lista i ett kall), ellers én-og-én.
 * Returnerer antall som ble forsøkt sendt.
 */
export async function sendBulkSms(
  recipients: string[],
  body: string,
): Promise<{ sent: number }> {
  const dests = Array.from(
    new Set(recipients.map((r) => toE164(r)).filter(Boolean)),
  );
  if (dests.length === 0 || !body?.trim()) return { sent: 0 };

  const p = provider();
  if (p === "gatewayapi") return { sent: await viaGatewayApi(dests, body) };
  if (p === "sveve") return { sent: await viaSveve(dests, body) };

  // Twilio / generic: send i småbolker for å unngå timeout.
  let sent = 0;
  for (let i = 0; i < dests.length; i += 20) {
    const batch = dests.slice(i, i + 20);
    const oks = await Promise.all(batch.map((d) => sendSms(d, body)));
    sent += oks.filter(Boolean).length;
  }
  return { sent };
}
