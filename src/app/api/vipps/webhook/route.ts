import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { capturePayment } from "@/lib/vipps";
import { config } from "@/lib/config";

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
  try {
    const body = await req.json();
    const reference: string = body?.reference ?? "";
    const name: string = body?.name ?? body?.eventName ?? "";
    // KUN nettbooking-betalinger (booking-<id>) håndteres her. Kasse-betalinger
    // (kasse-<id>-…) styres av polling i kassa (capture + registrer salg der),
    // så webhooken må IKKE røre dem – ellers blir det dobbel capture.
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
