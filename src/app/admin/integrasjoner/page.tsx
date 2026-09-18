import Link from "next/link";
import { config } from "@/lib/config";
import { getSmsConfigAdmin } from "@/lib/sms";
import { getReviewConfigAdmin } from "@/lib/reviews";
import { SmsConfigForm } from "@/components/admin/SmsConfigForm";

export const dynamic = "force-dynamic";

type Status = "ok" | "partial" | "off";

function StatusBadge({ status, text }: { status: Status; text: string }) {
  const cls =
    status === "ok"
      ? "bg-accent-soft/15 text-accent-soft"
      : status === "partial"
        ? "bg-surface-2 text-fg"
        : "bg-surface-2 text-muted";
  return (
    <span className={"rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + cls}>
      {text}
    </span>
  );
}

function IntegrationCard({
  title,
  status,
  badge,
  children,
}: {
  title: string;
  status: Status;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg">{title}</h3>
        <StatusBadge status={status} text={badge} />
      </div>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  );
}

export default async function AdminIntegrasjoner() {
  const [sms, review] = await Promise.all([
    getSmsConfigAdmin(),
    getReviewConfigAdmin(),
  ]);

  const resendSet = Boolean(process.env.RESEND_API_KEY);
  const emailFromSet = Boolean(process.env.EMAIL_FROM);
  const serviceRoleSet = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const vippsMode = config.vipps.mode;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Integrasjoner</h1>
        <p className="mt-1 text-sm text-muted">
          Koble til og test eksterne tjenester. Hemmeligheter lagres trygt (kun
          admin) og vises aldri tilbake.
        </p>
      </div>

      {/* Statusoversikt */}
      <div className="grid gap-4 sm:grid-cols-2">
        <IntegrationCard
          title="SMS"
          status={sms.configured ? "ok" : "off"}
          badge={sms.configured ? `Aktiv · ${sms.effectiveProvider}` : "Ikke aktiv"}
        >
          {sms.configured
            ? `Avsender: ${sms.sender}. Konfigureres nedenfor.`
            : "Ingen leverandør satt opp. Konfigurer nedenfor."}
        </IntegrationCard>

        <IntegrationCard
          title="Omdømme (Google / TripAdvisor)"
          status={review.googleKeySet || review.taKeySet ? "ok" : "off"}
          badge={review.googleKeySet ? "Google satt" : review.taKeySet ? "TA satt" : "Ikke satt"}
        >
          Google-anmeldelser og TripAdvisor konfigureres på{" "}
          <Link href="/admin/rating" className="text-accent-soft hover:underline">
            Rating &amp; omdømme
          </Link>
          . Place-ID {review.googlePlaceId ? "er satt." : "mangler."}
        </IntegrationCard>

        <IntegrationCard
          title="E-post (Resend)"
          status={resendSet && emailFromSet ? "ok" : resendSet ? "partial" : "off"}
          badge={resendSet ? (emailFromSet ? "Aktiv" : "Mangler avsender") : "Ikke satt"}
        >
          {resendSet
            ? emailFromSet
              ? "Sender bekreftelser, påminnelser og lønnslipper."
              : "RESEND_API_KEY er satt, men EMAIL_FROM mangler (må verifiseres for domenet)."
            : "Sett RESEND_API_KEY + EMAIL_FROM i Vercel."}
        </IntegrationCard>

        <IntegrationCard
          title="Betaling (Vipps)"
          status={vippsMode === "production" ? "ok" : vippsMode === "test" ? "partial" : "off"}
          badge={vippsMode === "production" ? "Produksjon" : vippsMode === "test" ? "Test" : "Mock"}
        >
          {vippsMode === "mock"
            ? "Kjører i mock-modus. Sett VIPPS_CLIENT_ID, VIPPS_CLIENT_SECRET, VIPPS_SUBSCRIPTION_KEY og VIPPS_MSN i Vercel (VIPPS_ENV=production for live)."
            : `Vipps er i ${vippsMode}-modus.`}
        </IntegrationCard>

        <IntegrationCard
          title="Supabase service-role"
          status={serviceRoleSet ? "ok" : "off"}
          badge={serviceRoleSet ? "Satt" : "Mangler"}
        >
          {serviceRoleSet
            ? "Server-til-server-nøkkel er på plass (webhooks, cron, SMS-utsending)."
            : "SUPABASE_SERVICE_ROLE_KEY mangler i Vercel — webhooks/cron/SMS vil ikke virke."}
        </IntegrationCard>
      </div>

      {/* SMS-konfig */}
      <div className="border border-line bg-surface p-6">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold">SMS-leverandør</h2>
          <p className="mt-1 text-sm text-muted">
            Velg leverandør og lim inn nøkkel. Anbefalt: GatewayAPI (nordisk,
            rimelig). Lagres kun for admin. Bruk test-knappen nederst for å
            bekrefte at det virker.
          </p>
        </div>
        <SmsConfigForm status={sms} />
      </div>
    </div>
  );
}
