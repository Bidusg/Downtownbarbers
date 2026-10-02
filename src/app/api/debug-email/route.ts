import { NextResponse } from "next/server";

// Avviklet: dette var et midlertidig feilsøkingsendepunkt som lekket
// RESEND-nøkkelprefiks og sendte test-e-post til en hardkodet adresse uten
// autentisering. Nøytralisert til 404 – ingen hemmeligheter, ingen utsending.
// Filen kan slettes helt ved anledning.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
