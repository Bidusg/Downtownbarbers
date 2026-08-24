import { NextRequest, NextResponse } from "next/server";
import { createPayment } from "@/lib/vipps";

/**
 * Starter en Vipps-betaling for en booking og redirecter kunden videre.
 * GET /api/vipps/create?booking=<id>&amount=<ore>
 * (amount i øre; 45000 = 450 kr. Depositum kan settes lavere.)
 */
export async function GET(req: NextRequest) {
  const booking = req.nextUrl.searchParams.get("booking");
  const amount = Number(req.nextUrl.searchParams.get("amount") ?? "0");

  if (!booking || !amount) {
    return NextResponse.redirect(new URL("/booking", req.url));
  }

  try {
    const { redirectUrl } = await createPayment({
      bookingId: booking,
      amountOre: amount,
      description: "Downtown Barbers – depositum",
    });
    return NextResponse.redirect(redirectUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/booking/bekreftelse?feil=1", req.url),
    );
  }
}
