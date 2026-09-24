import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { mapPurchase } from "@/lib/zettle";
import { ingestSales } from "@/lib/zettle-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Zettle-webhook: mottar «PurchaseCreated»-hendelser og speiler salget inn i
 * external_sales. Aktiveres når Zettle-kontoen finnes:
 *   1) Opprett en webhook-abonnement i Zettle Developer Portal som peker hit
 *      (…/api/zettle/webhook) med eventName PurchaseCreated.
 *   2) Legg signeringsnøkkelen i ZETTLE_WEBHOOK_SIGNING_KEY for verifisering.
 *
 * Uten signeringsnøkkel hopper vi over verifisering (kun for oppsett/test).
 */
function verifySignature(raw: string, header: string | null): boolean {
  const key = process.env.ZETTLE_WEBHOOK_SIGNING_KEY;
  if (!key) return true; // ikke konfigurert ennå – tillat i oppsettsfasen
  if (!header) return false;
  try {
    const digest = createHmac("sha256", key).update(raw).digest("hex");
    const a = Buffer.from(digest);
    const b = Buffer.from(header);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const sig =
      req.headers.get("x-izettle-signature") ||
      req.headers.get("x-zettle-signature");
    if (!verifySignature(raw, sig)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }

    const event = JSON.parse(raw) as { eventName?: string; payload?: unknown };

    // payload kan komme som JSON-streng eller objekt.
    const purchase =
      typeof event.payload === "string"
        ? JSON.parse(event.payload)
        : (event.payload ?? event);

    const mapped = mapPurchase(purchase);
    if (!mapped) return NextResponse.json({ ok: true, skipped: true });

    const { upserted } = await ingestSales([mapped]);
    return NextResponse.json({ ok: true, upserted });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 400 },
    );
  }
}

// Enkel helsesjekk (Zettre-portalen/pinging).
export async function GET() {
  return NextResponse.json({ ok: true, service: "zettle-webhook" });
}
