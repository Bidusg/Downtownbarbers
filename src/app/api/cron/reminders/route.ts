import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBookingReminderEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

/**
 * Sender timepåminnelser (e-post + SMS) for bookinger som starter innen 24t
 * og som ikke er påminnet før. Ment å kjøres av Vercel Cron (se vercel.json),
 * f.eks. hver time. Idempotent: hver booking påminnes kun én gang.
 *
 * Sikring: hvis CRON_SECRET er satt, kreves "Authorization: Bearer <secret>".
 * Vercel Cron sender denne automatisk når CRON_SECRET finnes i prosjektet.
 */
export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const sb = await createClient();
    const { data, error } = await sb.rpc("due_reminders");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as {
      id: string;
      start_at: string;
      customer_name: string;
      email: string | null;
      phone: string | null;
      service_name: string | null;
      barber_name: string | null;
    }[];

    let emailed = 0;
    let texted = 0;

    for (const b of rows) {
      const date = fmtDate(b.start_at);
      const time = fmtTime(b.start_at);
      const service = b.service_name ?? "time";
      const barber = b.barber_name ?? "oss";

      if (b.email) {
        const ok = await sendBookingReminderEmail({
          to: b.email,
          name: b.customer_name,
          service,
          barber,
          date,
          time,
        });
        if (ok) emailed++;
      }

      if (b.phone) {
        const ok = await sendSms(
          b.phone,
          `Påminnelse: ${service} hos Downtown Barbers ${date} kl. ${time}. Osterhaus' gate 10. Trenger du å endre? Ring +47 463 58 764.`,
        );
        if (ok) texted++;
      }

      // Marker som påminnet uansett kanal, så vi ikke spammer.
      await sb.rpc("mark_reminder_sent", { p_booking: b.id });
    }

    return NextResponse.json({
      ok: true,
      due: rows.length,
      emailed,
      texted,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
