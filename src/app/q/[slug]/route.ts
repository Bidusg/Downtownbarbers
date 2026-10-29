import { NextResponse, type NextRequest } from "next/server";
import { PROMO_COOKIE, scanPromo } from "@/lib/promo";

export const dynamic = "force-dynamic";

/**
 * QR-koden peker hit. Gyldig kode → huskes i nettleseren (httpOnly) og
 * kunden sendes til tilbudssiden. Ugyldig/utløpt → vanlig booking.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const promo = await scanPromo(slug);
  const to = new URL(promo ? "/tilbud" : "/booking", req.nextUrl.origin);
  const res = NextResponse.redirect(to, 303);
  if (promo) {
    res.cookies.set(PROMO_COOKIE, promo.slug, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 75,
    });
  }
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
