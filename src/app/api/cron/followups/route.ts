import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runFollowups } from "@/lib/followups";

/**
 * AI-oppfølging: sender «book ny time»-e-post til kunder som ikke har vært
 * innom på en stund og ikke har en kommende booking. Kan kjøres av Vercel
 * Cron ELLER manuelt. Kjøres også automatisk sammen med /api/cron/reminders.
 *
 * Sikring: hvis CRON_SECRET er satt, kreves "Authorization: Bearer <secret>".
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
  // Cron/server-til-server: due_followups + mark_followup_sent er låst til
  // service-role (0041).
  const result = await runFollowups({ weeks: 6 }, createServiceClient());
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
