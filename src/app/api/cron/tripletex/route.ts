import { checkBearer } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { tripletexConfigured } from "@/lib/tripletex/config";
import { buildDailyVoucherPlan, postDailyVoucher } from "@/lib/tripletex/voucher";

/**
 * Sender gårsdagens dagsbilag til Tripletex (revisor). Ment å kjøres av Vercel
 * Cron én gang i døgnet (natt). Duplikatsperre er på plass: en dato som allerede
 * er postet (logget i tripletex_voucher_log) postes ikke på nytt.
 *
 * Trygghet:
 *  - CRON_SECRET-header kreves (fail closed hvis den mangler) (som de andre cron-rutene).
 *  - Uten TRIPLETEX_API_TOKEN: returneres kun bilagsplanen (dry-run), ingen
 *    kontakt med Tripletex – nyttig for å verifisere kontoplanen med Kumar.
 *  - Med token men uten TRIPLETEX_POSTING_ENABLED: bygger bilaget mot Tripletex
 *    (løser konto-id-er) men poster ikke.
 *
 * Valgfri ?date=yyyy-mm-dd for manuell etterkjøring; ellers gårsdagen (Oslo).
 */
export const dynamic = "force-dynamic";

function osloYesterday(): string {
  const todayOslo = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
  const d = new Date(`${todayOslo}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const denied = checkBearer(req, "CRON_SECRET");
  if (denied) return denied;

  const dateParam = req.nextUrl.searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : osloYesterday();

  try {
    // Ingen nøkkel enda: vis bilagsplanen uten å kontakte Tripletex.
    if (!tripletexConfigured()) {
      const plan = await buildDailyVoucherPlan(date);
      return NextResponse.json({
        configured: false,
        note: "Tripletex ikke konfigurert – viser kun bilagsplan (dry-run).",
        plan,
      });
    }

    const result = await postDailyVoucher(date);
    return NextResponse.json({ configured: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), date },
      { status: 500 },
    );
  }
}
