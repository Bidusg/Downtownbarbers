import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { classifyInbound } from "@/lib/sms";

/**
 * Innkommende SMS – leverandør-uavhengig webhook for A2P-svar (STOPP/START).
 *
 * A2P-leverandører POSTer (noen GETer) hit når en kunde svarer på en SMS.
 * Vi plukker ut avsendernummer + meldingstekst uansett format, klassifiserer
 * STOPP/START, og oppdaterer samtykke via sms_inbound_handle. Alt logges i
 * sms_inbound. Enforcement er automatisk: markedsføring sender kun til
 * marketing_consent = true, så en STOPP fjerner kunden fra framtidige
 * markedsførings-SMS umiddelbart. Booking-påminnelser er transaksjonelle og
 * påvirkes ikke.
 *
 * Sett callback-URL hos leverandøren til:
 *   https://<domenet>/api/sms/inbound
 * Sikring (valgfri, men anbefalt): sett SMS_INBOUND_SECRET i Vercel og legg
 * enten header «x-sms-secret: <secret>» eller «?key=<secret>» på URL-en.
 * Uten SMS_INBOUND_SECRET er ruten åpen (som SMS-sending ellers), så den er
 * testbar før nøkkelen er satt.
 *
 * Konfigurér avsender-nøkler:
 *   GatewayAPI: {msisdn, message}   Sveve: {fra/telefon, melding/text}
 *   Twilio:     {From, Body}        Generisk: {from, message/text/body}
 */
export const dynamic = "force-dynamic";

const FROM_KEYS = [
  "msisdn", "from", "sender", "sourceaddr", "source", "fra", "telefon",
  "phone", "number", "originator", "senderaddress",
];
const BODY_KEYS = [
  "message", "text", "body", "melding", "content", "msg", "sms", "smstext",
];

/** Slå opp første tilstedeværende nøkkel (case-uavhengig) i et flatt objekt. */
function pick(map: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = map[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function lowerKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}

async function parseRequest(
  req: NextRequest,
): Promise<{ from: string; body: string }> {
  const map: Record<string, unknown> = {};

  // Query-parametre (GET, eller POST med parametre i URL).
  req.nextUrl.searchParams.forEach((v, k) => (map[k.toLowerCase()] = v));

  if (req.method === "POST") {
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    try {
      if (ct.includes("application/json")) {
        const json = (await req.json()) as Record<string, unknown>;
        Object.assign(map, lowerKeys(json ?? {}));
      } else if (
        ct.includes("application/x-www-form-urlencoded") ||
        ct.includes("multipart/form-data")
      ) {
        const form = await req.formData();
        form.forEach((v, k) => (map[k.toLowerCase()] = v));
      } else {
        // Ukjent content-type: prøv JSON, fall tilbake til tekst.
        const raw = await req.text();
        if (raw) {
          try {
            Object.assign(map, lowerKeys(JSON.parse(raw)));
          } catch {
            new URLSearchParams(raw).forEach(
              (v, k) => (map[k.toLowerCase()] = v),
            );
          }
        }
      }
    } catch {
      // ignorer parse-feil – vi svarer 200 uansett
    }
  }

  return { from: pick(map, FROM_KEYS), body: pick(map, BODY_KEYS) };
}

/** Sjekk delt hemmelighet hvis SMS_INBOUND_SECRET er satt. */
function secretOk(req: NextRequest): boolean {
  const secret = process.env.SMS_INBOUND_SECRET;
  if (!secret) return true;
  const header = req.headers.get("x-sms-secret");
  const query = req.nextUrl.searchParams.get("key");
  return header === secret || query === secret;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { from, body } = await parseRequest(req);
  if (!from) {
    // Ingen avsender å knytte til – svar 200 så leverandøren ikke re-sender.
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  const action = classifyInbound(body);

  try {
    // sms_inbound_handle er låst til service-role (0041) – webhook er server-til-server.
    const sb = createServiceClient();
    const { data } = await sb.rpc("sms_inbound_handle", {
      p_from: from,
      p_body: body,
      p_action: action,
    });
    const result = (data ?? {}) as { action?: string; matched?: number };
    return NextResponse.json({
      ok: true,
      action: result.action ?? action,
      matched: result.matched ?? 0,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
