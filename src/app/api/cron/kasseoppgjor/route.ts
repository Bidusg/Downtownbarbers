import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getExpectedByMethodForDate } from "@/lib/ops-queries";
import { getMissingSettlementDays } from "@/lib/settlement-status";
import { sendSettlementReminderEmail } from "@/lib/email";

/**
 * KASSEOPPGJØR-TVANG (løsning D) – daglig cron. To ting i én jobb:
 *
 *  1) AUTO-UTKAST: oppretter et kasseoppgjør-UTKAST for gårsdagen fra
 *     registrerte salg (forventet kontant/kort/vipps) hvis dagen ikke
 *     allerede har et oppgjør. Utkastet får confirmed = false → status
 *     «venter på bekreftelse». Det BOKFØRES IKKE automatisk – et menneske
 *     bekrefter opptellingen i kasseoppgjør-siden. Tripletex-bilaget
 *     håndteres fortsatt av /api/cron/tripletex; denne cronen rører det ikke.
 *
 *  2) PÅMINNELSE: hvis det finnes dager (t.o.m. i går) med salg uten
 *     bekreftet oppgjør, sendes en daglig e-post til ansvarlig (samme
 *     mottaker som booking-varslingen: settings.booking_notify).
 *
 * Trygghet:
 *  - CRON_SECRET-header kreves hvis satt (som de andre cron-rutene).
 *  - Service-klient (RLS bypass) siden det ikke finnes en innlogget bruker.
 *  - Fungerer også FØR SQL-migrasjonen: mangler confirmed-kolonnen, feiler
 *    draft-insertet trygt (fanges), og ingen utkast opprettes før kolonnen
 *    finnes. Påminnelsen degraderer også til «dager helt uten oppgjør».
 *
 * Valgfri ?date=yyyy-mm-dd for manuell etterkjøring av utkastet; ellers
 * gårsdagen (Oslo). Kjør én gang i døgnet (se vercel.json i rapporten).
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
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : osloYesterday();

  let sb: ReturnType<typeof createServiceClient>;
  try {
    sb = createServiceClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "service-klient mangler" },
      { status: 500 },
    );
  }

  /* ---------- 1) AUTO-UTKAST for gårsdagen --------------------------- */
  const draft: {
    date: string;
    created: boolean;
    reason?: string;
    expectedTotal?: number;
  } = { date, created: false };

  try {
    const { data: existing } = await sb
      .from("cash_settlements")
      .select("id")
      .eq("settle_date", date)
      .limit(1);

    if (existing && existing.length > 0) {
      draft.reason = "oppgjør finnes allerede";
    } else {
      const expected = await getExpectedByMethodForDate(date, sb);
      const expectedTotal = expected.cash + expected.card + expected.vipps;
      draft.expectedTotal = expectedTotal;

      if (expectedTotal <= 0) {
        draft.reason = "ingen registrert salg";
      } else {
        // Utkast: forventet er snapshot, talt forhåndsutfylles med forventet
        // (menneske bekrefter/justerer), confirmed = false → venter.
        const { error } = await sb.from("cash_settlements").insert({
          settle_date: date,
          total_nok: expectedTotal,
          counted_cash: expected.cash,
          counted_card: expected.card,
          counted_vipps: expected.vipps,
          expected_cash: expected.cash,
          expected_card: expected.card,
          expected_vipps: expected.vipps,
          confirmed: false,
          note: "Auto-utkast – venter på bekreftelse av opptelling",
          opened_by: null,
        });
        if (error) {
          // Vanligste årsak før SQL er kjørt: confirmed-kolonnen finnes ikke.
          draft.reason = `kunne ikke opprette utkast: ${error.message}`;
        } else {
          draft.created = true;
        }
      }
    }
  } catch (e) {
    draft.reason = e instanceof Error ? e.message : "ukjent feil";
  }

  /* ---------- 2) PÅMINNELSE til ansvarlig ---------------------------- */
  const reminder: {
    missingDays: number;
    emailed: boolean;
    reason?: string;
  } = { missingDays: 0, emailed: false };

  try {
    const missing = await getMissingSettlementDays(14, sb);
    reminder.missingDays = missing.length;
    if (missing.length === 0) {
      reminder.reason = "ingenting mangler";
    } else {
      const { data: cfg } = await sb
        .from("settings")
        .select("value")
        .eq("key", "booking_notify")
        .maybeSingle();
      const v = (cfg?.value ?? null) as { enabled?: boolean; email?: string } | null;
      if (v?.enabled && v.email) {
        reminder.emailed = await sendSettlementReminderEmail({
          to: v.email,
          days: missing.map((m) => ({ date: m.date, salesTotal: m.salesTotal })),
        });
        if (!reminder.emailed) reminder.reason = "e-post ikke sendt (RESEND?)";
      } else {
        reminder.reason = "ingen ansvarlig e-post satt (settings.booking_notify)";
      }
    }
  } catch (e) {
    reminder.reason = e instanceof Error ? e.message : "ukjent feil";
  }

  return NextResponse.json({ ok: true, draft, reminder });
}
