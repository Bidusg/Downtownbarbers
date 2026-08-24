import { NextRequest, NextResponse } from "next/server";
import { createPayment } from "@/lib/vipps";
import { createClient } from "@/lib/supabase/server";

/**
 * Starter en Vipps-betaling for en booking og redirecter kunden videre.
 * GET /api/vipps/create?booking=<id>
 *
 * Beløpet hentes ALLTID server-side fra databasen (booking_amount_ore),
 * aldri fra URL-en. Klienten kan ikke styre hva som belastes.
 */
export async function GET(req: NextRequest) {
  const booking = req.nextUrl.searchParams.get("booking");
  if (!booking) {
    return NextResponse.redirect(new URL("/booking", req.url));
  }

  try {
    const sb = await createClient();
    const { data: amountOre, error } = await sb.rpc("booking_amount_ore", {
      p_booking: booking,
    });

    const amount = Number(amountOre ?? 0);
    if (error || !amount) {
      return NextResponse.redirect(new URL("/booking/bekreftelse?feil=1", req.url));
    }

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
