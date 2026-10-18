/**
 * SMS-lag – leverandør-uavhengig, laget for A2P-leverandører (bedrift-SMS med
 * eget avsendernavn). Sender kun hvis en leverandør er konfigurert – ellers
 * hoppes det stille over, akkurat som e-post. Slik virker påminnelser uansett,
 * og SMS slås på når leverandøren er satt opp.
 *
 * Konfig kan settes i /admin/integrasjoner (lagres i sms_config, kun admin) og
 * leses server-side via service-role. Mangler service-nøkkel/rad, faller vi
 * tilbake til env-variablene, så eksisterende oppsett virker uendret:
 *
 *   GatewayAPI (anbefalt, nordisk, billig):
 *     SMS_PROVIDER=gatewayapi · GATEWAYAPI_TOKEN=… · SMS_SENDER=Downtown
 *   Sveve (norsk):
 *     SMS_PROVIDER=sveve · SVEVE_USER=… · SVEVE_PASSWORD=… · SMS_SENDER=Downtown
 *   Twilio:
 *     SMS_PROVIDER=twilio · TWILIO_ACCOUNT_SID=… · TWILIO_AUTH_TOKEN=… · TWILIO_FROM=…
 *   Generisk HTTP (A2P-API med bearer + JSON):
 *     SMS_PROVIDER=generic · SMS_API_URL=… · SMS_API_KEY=… · SMS_SENDER=Downtown
 */

import { createServiceClient } from "@/lib/supabase/service";

export type Provider = "gatewayapi" | "sveve" | "twilio" | "generic" | "";

export type SmsConfig = {
  provider: Provider;
  sender: string;
  gatewayapiToken: string | null;
  sveveUser: string | null;
  svevePassword: string | null;
  twilioSid: string | null;
  twilioToken: string | null;
  twilioFrom: string | null;
  genericUrl: string | null;
  genericKey: string | null;
  enabled: boolean;
};

/** Velg leverandør eksplisitt, ellers gjett fra hvilke nøkler som finnes. */
function resolveProvider(c: {
  provider?: string | null;
  gatewayapiToken: string | null;
  sveveUser: string | null;
  svevePassword: string | null;
  twilioSid: string | null;
  twilioToken: string | null;
  genericUrl: string | null;
}): Provider {
  const p = (c.provider ?? "").toLowerCase();
  if (p === "gatewayapi" || p === "sveve" || p === "twilio" || p === "generic")
    return p;
  if (c.gatewayapiToken) return "gatewayapi";
  if (c.sveveUser && c.svevePassword) return "sveve";
  if (c.twilioSid && c.twilioToken) return "twilio";
  if (c.genericUrl) return "generic";
  return "";
}

function envConfig(): SmsConfig {
  const raw = {
    provider: process.env.SMS_PROVIDER ?? null,
    gatewayapiToken: process.env.GATEWAYAPI_TOKEN || null,
    sveveUser: process.env.SVEVE_USER || null,
    svevePassword: process.env.SVEVE_PASSWORD || null,
    twilioSid: process.env.TWILIO_ACCOUNT_SID || null,
    twilioToken: process.env.TWILIO_AUTH_TOKEN || null,
    twilioFrom: process.env.TWILIO_FROM || null,
    genericUrl: process.env.SMS_API_URL || null,
    genericKey: process.env.SMS_API_KEY || null,
  };
  return {
    ...raw,
    provider: resolveProvider(raw),
    sender: process.env.SMS_SENDER || process.env.TWILIO_FROM || "Downtown",
    enabled: true,
  };
}

/** Full konfig (DB via service-role, env-fallback). Kun server. */
export async function getSmsConfig(): Promise<SmsConfig> {
  const env = envConfig();
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("sms_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return env;
    const d = data as Record<string, unknown>;
    const merged = {
      provider: (d.provider as string) || env.provider,
      gatewayapiToken: (d.gatewayapi_token as string) || env.gatewayapiToken,
      sveveUser: (d.sveve_user as string) || env.sveveUser,
      svevePassword: (d.sveve_password as string) || env.svevePassword,
      twilioSid: (d.twilio_account_sid as string) || env.twilioSid,
      twilioToken: (d.twilio_auth_token as string) || env.twilioToken,
      twilioFrom: (d.twilio_from as string) || env.twilioFrom,
      genericUrl: (d.generic_api_url as string) || env.genericUrl,
      genericKey: (d.generic_api_key as string) || env.genericKey,
    };
    return {
      ...merged,
      provider: resolveProvider(merged),
      sender: (d.sender as string) || env.sender,
      enabled: d.enabled !== false,
    };
  } catch {
    return env; // ingen service-nøkkel → env-styrt som før
  }
}

/** Status til admin-skjemaet: aldri selve nøklene – kun om de er satt. */
export type SmsConfigStatus = {
  provider: Provider;
  effectiveProvider: Provider; // etter auto-gjetting
  sender: string;
  enabled: boolean;
  gatewayapiSet: boolean;
  sveveSet: boolean;
  twilioSet: boolean;
  twilioFrom: string;
  genericUrl: string;
  genericKeySet: boolean;
  configured: boolean;
};

export async function getSmsConfigAdmin(): Promise<SmsConfigStatus> {
  const c = await getSmsConfig();
  // provider-feltet slik det er lagret (uten auto-gjetting) er ikke eksponert
  // separat; vis effektiv provider + av/på + hvilke nøkler som finnes.
  return {
    provider: c.provider,
    effectiveProvider: c.provider,
    sender: c.sender,
    enabled: c.enabled,
    gatewayapiSet: Boolean(c.gatewayapiToken),
    sveveSet: Boolean(c.sveveUser && c.svevePassword),
    twilioSet: Boolean(c.twilioSid && c.twilioToken),
    twilioFrom: c.twilioFrom ?? "",
    genericUrl: c.genericUrl ?? "",
    genericKeySet: Boolean(c.genericKey),
    configured: c.enabled && c.provider !== "",
  };
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

/** Siste feilmelding fra leverandøren (til SMS-loggen). */
let lastProviderError: string | null = null;

async function viaGatewayApi(c: SmsConfig, dests: string[], body: string): Promise<number> {
  const token = c.gatewayapiToken;
  lastProviderError = null;
  if (!token) {
    lastProviderError = "API-token mangler";
    return 0;
  }
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
      body: JSON.stringify({ sender: c.sender, message: body, recipients }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { message?: string; code?: string };
        detail = j.message ?? j.code ?? "";
      } catch {
        /* ingen JSON */
      }
      lastProviderError = `GatewayAPI svarte ${res.status}${detail ? `: ${detail}` : ""}`;
      return 0;
    }
    return recipients.length;
  } catch (e) {
    lastProviderError = e instanceof Error ? e.message : "nettverksfeil";
    return 0;
  }
}

async function viaSveve(c: SmsConfig, dests: string[], body: string): Promise<number> {
  if (!c.sveveUser || !c.svevePassword) return 0;
  try {
    const res = await fetch("https://sveve.no/SMS/SendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        user: c.sveveUser,
        passwd: c.svevePassword,
        from: c.sender,
        to: dests.join(","),
        msg: body,
      }),
    });
    return res.ok ? dests.length : 0;
  } catch {
    return 0;
  }
}

async function viaTwilio(c: SmsConfig, dest: string, body: string): Promise<boolean> {
  if (!c.twilioSid || !c.twilioToken) return false;
  const from = c.twilioFrom || c.sender;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${c.twilioSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${c.twilioSid}:${c.twilioToken}`).toString("base64"),
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

async function viaGeneric(c: SmsConfig, dest: string, body: string): Promise<boolean> {
  if (!c.genericUrl) return false;
  try {
    const res = await fetch(c.genericUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.genericKey ? { Authorization: `Bearer ${c.genericKey}` } : {}),
      },
      body: JSON.stringify({ to: dest, from: c.sender, message: body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------------- Offentlig API ---------------- */

async function sendWith(c: SmsConfig, to: string, body: string): Promise<boolean> {
  const dest = toE164(to);
  if (!dest || !body?.trim() || !c.enabled) return false;
  switch (c.provider) {
    case "gatewayapi":
      return (await viaGatewayApi(c, [dest], body)) > 0;
    case "sveve":
      return (await viaSveve(c, [dest], body)) > 0;
    case "twilio":
      return viaTwilio(c, dest, body);
    case "generic":
      return viaGeneric(c, dest, body);
    default:
      return false; // ingen leverandør konfigurert
  }
}

export type SmsKind = "bekreftelse" | "påminnelse" | "test" | "markedsføring" | "annet";

/** Lagre forsøket i sms_log (best-effort – feiler aldri utsendingen). */
async function logSms(row: {
  to: string;
  kind: SmsKind;
  body: string;
  status: "sendt" | "feilet" | "hoppet over";
  error?: string | null;
  bookingId?: string | null;
}): Promise<void> {
  try {
    await createServiceClient().from("sms_log").insert({
      to_number: row.to,
      kind: row.kind,
      body: row.body,
      status: row.status,
      error: row.error ?? null,
      booking_id: row.bookingId ?? null,
    });
  } catch {
    /* loggen er bare til innsyn */
  }
}

/**
 * Send én SMS. Returnerer true hvis sendt OK, false hvis hoppet over/feilet.
 * Hvert forsøk logges i sms_log (admin → Integrasjoner → SMS-logg).
 */
export async function sendSms(
  to: string,
  body: string,
  meta?: { kind?: SmsKind; bookingId?: string | null },
): Promise<boolean> {
  const c = await getSmsConfig();
  const kind = meta?.kind ?? "annet";
  const dest = toE164(to);
  let skip: string | null = null;
  if (!c.enabled || c.provider === "") skip = "SMS er ikke aktivert/satt opp";
  else if (!dest) skip = "ugyldig telefonnummer";
  else if (!body?.trim()) skip = "tom tekst";
  if (skip) {
    await logSms({ to: dest || to, kind, body, status: "hoppet over", error: skip, bookingId: meta?.bookingId });
    return false;
  }
  lastProviderError = null;
  const ok = await sendWith(c, to, body);
  await logSms({
    to: dest,
    kind,
    body,
    status: ok ? "sendt" : "feilet",
    error: ok ? null : (lastProviderError ?? "leverandøren avviste meldingen"),
    bookingId: meta?.bookingId,
  });
  return ok;
}

export type SmsLogRow = {
  id: string;
  created_at: string;
  to_number: string | null;
  kind: string;
  body: string | null;
  status: string;
  error: string | null;
};

/** Siste SMS-forsøk (admin). Tom liste hvis tabellen ikke finnes ennå. */
export async function getSmsLog(limit = 50): Promise<{ rows: SmsLogRow[]; missingTable: boolean }> {
  try {
    const { data, error } = await createServiceClient()
      .from("sms_log")
      .select("id, created_at, to_number, kind, body, status, error")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], missingTable: /sms_log|schema cache|does not exist/i.test(error.message) };
    return { rows: (data ?? []) as SmsLogRow[], missingTable: false };
  } catch {
    return { rows: [], missingTable: false };
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

  const c = await getSmsConfig();
  if (!c.enabled || c.provider === "") return { sent: 0 };
  if (c.provider === "gatewayapi") return { sent: await viaGatewayApi(c, dests, body) };
  if (c.provider === "sveve") return { sent: await viaSveve(c, dests, body) };

  // Twilio / generic: send i småbolker for å unngå timeout.
  let sent = 0;
  for (let i = 0; i < dests.length; i += 20) {
    const batch = dests.slice(i, i + 20);
    const oks = await Promise.all(batch.map((d) => sendWith(c, d, body)));
    sent += oks.filter(Boolean).length;
  }
  return { sent };
}
