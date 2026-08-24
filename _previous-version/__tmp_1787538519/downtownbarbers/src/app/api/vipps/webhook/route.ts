import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { capturePayment } from "@/lib/vipps";

async function markPaid(reference: string) {
  const sb = await createClient();
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
    if (reference && String(name).toUpperCase().includes("AUTHORIZED")) {
      const amountOre = Number(body?.amount?.value ?? 0);
      if (amountOre > 0) await capturePayment(reference, amountOre);
      await markPaid(reference);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
