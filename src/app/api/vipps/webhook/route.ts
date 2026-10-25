import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { capturePayment } from "@/lib/vipps";
import { config } from "@/lib/config";
import { markOrderAuthorized } from "@/lib/shop-orders";
import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Sjekker Vipps sin signatur (Webhooks API, HMAC-SHA256) så ingen andre kan
 * late som de er Vipps og markere bookinger som betalt.
 * Hemmeligheten får du når webhooken registreres hos Vipps → VIPPS_WEBHOOK_SECRET.
 * https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/request-authentication
 */
function verifyVippsSignature(req: NextRequest, rawBody: string, secret: string): boolean {
  const date = req.headers.get("x-ms-date") ?? "";
  const contentHash = req.headers.get("x-ms-content-sha256") ?? "";
  const host = req.headers.get("host") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!date || !contentHash || !host || !auth) return false;

  // 1) Body-hash må stemme (ingen har endret innholdet).
  const hash = createHash("sha256").update(rawBody, "utf8").digest("base64");
  if (hash !== contentHash) return false;

  // 2) Gammel melding? (vern mot gjenbruk) – godta 10 min avvik.
  const t = Date.parse(date);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 10 * 60 * 1000) return false;

  // 3) Signaturen.
  const pathAndQuery = req.nextUrl.pathname + req.nextUrl.search;
  const toSign = `POST\n${pathAndQuery}\n${date};${host};${contentHash}`;
  const sig = createHmac("sha256", secret).update(toSign, "utf8").digest("base64");
  const expected = `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${sig}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(auth);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Server-til-server: mark_booking_paid er låst til service-role (0041),
// så webhooken kaller den med den privilegerte klienten – aldri anon.
async function markPaid(reference: string) {
  const sb = createServiceClient();
  await sb.rpc("mark_booking_paid", { p_reference: reference });
}

/**
 * Mock-modus: kunden redirectes hit fra createPayment.
 * GET /api/vipps/webhook?mock=1&reference=booking-<id>
 * -> marker betalt og send til bekreftelse.
 */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") ?? "";
  const isMock = req.nextUrl.searchParams.get("mock") === "1";

  if (isMock && reference) {
    // Mock-snarveien markerer betalt uten ekte Vipps-verifisering, så den må
    // KUN virke når appen faktisk kjører i mock-modus.
    if (config.vipps.mode !== "mock") {
      return new NextResponse("Not found", { status: 404 });
    }
    // Nettbutikk (web-<ordre-id>): reservert → tilbake til ordresiden.
    if (reference.startsWith("web-")) {
      await markOrderAuthorized(reference.slice(4));
      const back = req.nextUrl.searchParams.get("back");
      const dest = back && back.startsWith(config.baseUrl) ? back : new URL("/butikk", req.url).toString();
      return NextResponse.redirect(dest);
    }
    await markPaid(reference);
    const url = new URL("/booking/bekreftelse", req.url);
    url.searchParams.set("ref", reference);
    url.searchParams.set("betalt", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL("/", req.url));
}

/**
 * Ekte Vipps-webhook (test/production): AUTHORIZED -> capture -> marker betalt.
 */
export async function POST(req: NextRequest) {
  // Ekte Vipps: krever gyldig signatur. Mangler hemmeligheten, avvises alt
  // (heller ingen automatisk «betalt» enn at hvem som helst kan sette det).
  const rawBody = await req.text();
  const secret = process.env.VIPPS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("Vipps-webhook avvist: VIPPS_WEBHOOK_SECRET er ikke satt.");
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 401 });
  }
  if (!verifyVippsSignature(req, rawBody, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const body = JSON.parse(rawBody);
    const reference: string = body?.reference ?? "";
    const name: string = body?.name ?? body?.eventName ?? "";
    // KUN nettbooking-betalinger (booking-<id>) håndteres her. Kasse-betalinger
    // (kasse-<id>-…) styres av polling i kassa (capture + registrer salg der),
    // så webhooken må IKKE røre dem – ellers blir det dobbel capture.
    // Nettbutikk: beløpet RESERVERES ved kjøp og trekkes først når varen er
    // utlevert/sendt (kassa → Nettordrer). Her markeres ordren bare som betalt.
    if (reference.startsWith("web-") && String(name).toUpperCase().includes("AUTHORIZED")) {
      await markOrderAuthorized(reference.slice(4));
    }
    if (
      reference.startsWith("booking-") &&
      String(name).toUpperCase().includes("AUTHORIZED")
    ) {
      const amountOre = Number(body?.amount?.value ?? 0);
      if (amountOre > 0) await capturePayment(reference, amountOre);
      await markPaid(reference);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
