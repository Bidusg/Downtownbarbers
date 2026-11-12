import { NextResponse } from "next/server";
import { after } from "next/server";
import { kickMarketingWorker, runMarketingWorker } from "@/lib/marketing-worker";
import { checkBearer } from "@/lib/cron-auth";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bakgrunnsarbeider for markedsførings-køen. Startes av server action
 * (sendMarketing) og av seg selv så lenge det er mer igjen. Beskyttet med
 * CRON_SECRET (påkrevd – mangler den, avvises alle kall).
 */
export async function POST(req: Request) {
  const denied = checkBearer(req, "CRON_SECRET");
  if (denied) return denied;
  const result = await runMarketingWorker();
  if (result.more) {
    const base = siteUrl();
    after(async () => {
      await kickMarketingWorker(base);
    });
  }
  return NextResponse.json(result);
}
