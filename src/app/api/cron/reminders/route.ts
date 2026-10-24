import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendBookingReminderEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { getSmsTemplates, renderSms } from "@/lib/sms-templates";
import { salonSmsVars } from "@/lib/sms-booking";
import { staffDisplayName } from "@/lib/staff-display";
import { runFollowups } from "@/lib/followups";
import { bookingLangs, fmtDayLang, translateServiceText } from "@/lib/i18n/server-lang";

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
      timeZone: "Europe/Oslo",
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
      // Serveren kjører i UTC – uten Europe/Oslo blir påminnelsen 2 timer feil.
      timeZone: "Europe/Oslo",
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
    // Cron/server-til-server: due_reminders + mark_reminder_sent er låst til
    // service-role (0041). Samme klient sendes til runFollowups.
    const sb = createServiceClient();
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

    // Barber-bilder/titler til e-posten: hentes én gang (offentlig lesbart).
    // Degraderer stille til initialer hvis oppslaget feiler.
    const barberInfo = new Map<string, { photoUrl?: string; title?: string }>();
    try {
      const { data: staff } = await sb
        .from("staff")
        .select("full_name, photo_url, title")
        .eq("active", true);
      for (const s of (staff ?? []) as {
        full_name: string | null;
        photo_url: string | null;
        title: string | null;
      }[]) {
        if (s.full_name)
          barberInfo.set(s.full_name, {
            photoUrl: s.photo_url ?? undefined,
            title: s.title ?? undefined,
          });
      }
    } catch {
      /* ignorer – barber-blokken viser initialer uten bilde */
    }

    let emailed = 0;
    let texted = 0;
    // Redigerbar SMS-tekst (admin → Integrasjoner → SMS-tekster).
    const smsTpl = await getSmsTemplates(sb);
    const salon = await salonSmsVars();
    // Kundens språk (customers.lang) – engelsk e-post/SMS til dem som booket på engelsk.
    const langs = await bookingLangs(sb, rows.map((r) => r.id));

    const failed: string[] = [];
    for (const b of rows) {
      // Én booking som feiler (ugyldig nummer, nettverk …) skal ikke stoppe
      // resten av påminnelsene eller oppfølgingsjobben.
      try {
        const lang = langs.get(b.id) ?? "no";
        const en = lang === "en";
        const date = en ? fmtDayLang(b.start_at, "en") : fmtDate(b.start_at);
        const time = fmtTime(b.start_at);
        const service = b.service_name
          ? await translateServiceText(b.service_name, lang)
          : en ? "appointment" : "time";
        const barber = b.barber_name ?? (en ? "us" : "oss");
        const info = b.barber_name ? barberInfo.get(b.barber_name) : undefined;

        if (b.email) {
          // Rådata (norsk tjeneste, ISO-tid) – e-posten oversetter selv og
          // lager «Read in English / Les på norsk»-lenken.
          const ok = await sendBookingReminderEmail({
            to: b.email,
            name: b.customer_name,
            service: b.service_name ?? "",
            barber: b.barber_name ?? "",
            date: b.start_at,
            time,
            barberPhotoUrl: info?.photoUrl,
            barberTitle: info?.title,
            lang,
          });
          if (ok) emailed++;
        }

        if (b.phone) {
          const ok = await sendSms(
            b.phone,
            renderSms(en ? smsTpl.reminderEn : smsTpl.reminder, {
              fornavn: (b.customer_name ?? "").trim().split(/\s+/)[0] ?? "",
              navn: b.customer_name ?? "",
              tjeneste: service,
              barber: await staffDisplayName(barber),
              dato: date,
              tid: time,
              varighet: "",
              ...salon,
            }),
            { kind: "påminnelse", bookingId: b.id },
          );
          if (ok) texted++;
        }
      } catch (e) {
        failed.push(b.id);
        console.error("Påminnelse feilet for booking", b.id, e);
      }

      // Marker som påminnet uansett kanal (og ved feil), så vi ikke spammer.
      try {
        await sb.rpc("mark_reminder_sent", { p_booking: b.id });
      } catch {
        /* prøves igjen neste kjøring */
      }
    }

    // Kjør AI-oppfølging i samme daglige jobb (unngår ekstra cron på Hobby).
    let followups: Awaited<ReturnType<typeof runFollowups>> | { error: string };
    try {
      followups = await runFollowups({ weeks: 6 }, sb);
    } catch (e) {
      followups = { error: e instanceof Error ? e.message : "unknown" };
    }

    return NextResponse.json({
      ok: true,
      due: rows.length,
      failed: failed.length,
      emailed,
      texted,
      followups,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
