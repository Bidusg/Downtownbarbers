import { NextRequest, NextResponse } from "next/server";
import { fetchPurchases, zettleConfigured } from "@/lib/zettle";
import { ingestSales } from "@/lib/zettle-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Backfill/sikkerhetsnett: henter Zettle-kjøp fra de siste N dagene og
 * speiler dem inn i external_sales. Kjøres av Vercel Cron eller manuelt.
 * Fanger opp kjøp som en webhook evt. gikk glipp av (idempotent upsert).
 *
 * Sikring: hvis CRON_SECRET er satt, kreves "Authorization: Bearer <secret>".
 * Aktiveres når ZETTLE_CLIENT_ID + ZETTLE_API_KEY finnes i miljøet.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (!zettleConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Zettle er ikke konfigurert ennå." },
      { status: 503 },
    );
  }
  try {
    const days = Number(req.nextUrl.searchParams.get("days") ?? "7");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sales = await fetchPurchases({ since, limit: 200 });
    const { upserted } = await ingestSales(sales);
    return NextResponse.json({ ok: true, fetched: sales.length, upserted });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
