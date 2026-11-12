import { checkBearer } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runFollowups } from "@/lib/followups";

/**
 * AI-oppfølging: sender «book ny time»-e-post til kunder som ikke har vært
 * innom på en stund og ikke har en kommende booking. Kan kjøres av Vercel
 * Cron ELLER manuelt. Kjøres også automatisk sammen med /api/cron/reminders.
 *
 * Sikring: CRON_SECRET kreves (fail closed hvis den mangler): "Authorization: Bearer <secret>".
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = checkBearer(req, "CRON_SECRET");
  if (denied) return denied;
  // Cron/server-til-server: due_followups + mark_followup_sent er låst til
  // service-role (0041).
  const result = await runFollowups({ weeks: 6 }, createServiceClient());
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
