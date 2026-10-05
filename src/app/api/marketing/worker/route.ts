import { NextResponse } from "next/server";
import { after } from "next/server";
import { isWorkerAuthorized, kickMarketingWorker, runMarketingWorker } from "@/lib/marketing-worker";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bakgrunnsarbeider for markedsførings-køen. Startes av server action
 * (sendMarketing) og av seg selv så lenge det er mer igjen. Beskyttet med
 * CRON_SECRET (fallback: utledet av service-nøkkelen).
 */
export async function POST(req: Request) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runMarketingWorker();
  if (result.more) {
    const base = siteUrl();
    after(async () => {
      await kickMarketingWorker(base);
    });
  }
  return NextResponse.json(result);
}
