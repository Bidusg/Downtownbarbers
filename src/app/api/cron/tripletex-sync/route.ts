import { NextRequest, NextResponse } from "next/server";
import { syncTripletexFinancials } from "@/lib/tripletex/sync";

/**
 * Synker regnskapsdata FRA Tripletex inn i Supabase (kontoplan, saldobalanse,
 * bilag, posteringer). Ment å kjøres av Vercel Cron én gang i døgnet (natt).
 *
 * Dette er motsatt vei av /api/cron/tripletex (som sender dagsbilag TIL
 * Tripletex): her henter vi regnskapstall ut og speiler dem lokalt, så
 * admin-/revisor-sidene viser ekte Tripletex-tall uten å kalle API-et direkte.
 *
 * Trygghet:
 *  - CRON_SECRET-header kreves hvis satt (som de andre cron-rutene).
 *  - Uten TRIPLETEX_API_TOKEN returnerer synken {configured:false} og rører
 *    ingenting.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await syncTripletexFinancials();
  return NextResponse.json(result);
}
