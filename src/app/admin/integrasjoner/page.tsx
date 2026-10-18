import { config } from "@/lib/config";
import { getSmsConfigAdmin } from "@/lib/sms";
import { SmsConfigForm } from "@/components/admin/SmsConfigForm";
import { SmsTemplateForm } from "@/components/admin/SmsTemplateForm";
import { getSmsTemplates } from "@/lib/sms-templates";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getBookingNotify, saveBookingNotify } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TripletexCard } from "@/components/admin/TripletexCard";
import { VippsCard } from "@/components/admin/VippsCard";
import { TRIPLETEX, tripletexConfigured } from "@/lib/tripletex/config";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

type Status = "ok" | "partial" | "off";

const STATUS_TONE: Record<Status, BadgeTone> = {
  ok: "success",
  partial: "warning",
  off: "neutral",
};

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
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg">{title}</h3>
        <Badge tone={STATUS_TONE[status]}>{badge}</Badge>
      </div>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </Card>
  );
}

/** Validerer og lagrer booking-varsling, og sjekker at det faktisk ble lagret. */
async function saveBookingNotifyWithFeedback(formData: FormData): Promise<void> {
  "use server";
  const back = (q: Record<string, string>) =>
    redirect("/admin/integrasjoner?" + new URLSearchParams(q).toString() + "#varsling");
  const enabled = formData.get("enabled") === "on";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (enabled && !email) back({ varselfeil: "Skriv inn en e-postadresse for å slå på varsling." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    back({ varselfeil: "Ugyldig e-postadresse." });
  try {
    await saveBookingNotify(formData);
  } catch {
    back({ varselfeil: "Kunne ikke lagre. Prøv igjen." });
  }
  // saveBookingNotify svelger feil – les tilbake for å bekrefte lagringen.
  const saved = await getBookingNotify();
  if (saved.email !== email || saved.enabled !== (enabled && !!email)) {
    back({ varselfeil: "Lagringen gikk ikke gjennom (mangler tilgang?)." });
  }
  back({ varsellagret: "1" });
}

export default async function AdminIntegrasjoner({
  searchParams,
}: {
  searchParams: Promise<{ varsellagret?: string; varselfeil?: string }>;
}) {
  const sp = await searchParams;
  const [sms, notify, smsTpl] = await Promise.all([
    getSmsConfigAdmin(),
    getBookingNotify(),
    createClient().then((sb) => getSmsTemplates(sb)),
  ]);

  const resendSet = Boolean(process.env.RESEND_API_KEY);
  const emailFromSet = Boolean(process.env.EMAIL_FROM);
  const serviceRoleSet = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const vippsMode = config.vipps.mode;
  const vippsVars = [
    { name: "VIPPS_CLIENT_ID", set: Boolean(process.env.VIPPS_CLIENT_ID) },
    { name: "VIPPS_CLIENT_SECRET", set: Boolean(process.env.VIPPS_CLIENT_SECRET) },
    {
      name: "VIPPS_SUBSCRIPTION_KEY",
      set: Boolean(process.env.VIPPS_SUBSCRIPTION_KEY),
    },
    { name: "VIPPS_MSN", set: Boolean(process.env.VIPPS_MSN) },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Integrasjoner"
        description="Koble til og test eksterne tjenester. Hemmeligheter lagres trygt (kun admin) og vises aldri tilbake."
      />

      {/* Teknisk advarsel – vises bare hvis noe mangler */}
      {!serviceRoleSet && (
        <p className="border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          SUPABASE_SERVICE_ROLE_KEY mangler i Vercel – automatiske varsler,
          planlagte jobber og SMS virker ikke før den er lagt inn.
        </p>
      )}

      {/* Statusoversikt */}
      <div className="grid gap-4 sm:grid-cols-3">
        <IntegrationCard
          title="SMS"
          status={sms.configured ? "ok" : "off"}
          badge={sms.configured ? "Aktiv" : "Ikke aktiv"}
        >
          {sms.configured
            ? `Avsender: ${sms.sender}. Konfigureres nedenfor.`
            : "Ingen leverandør satt opp. Konfigurer nedenfor."}
        </IntegrationCard>


        <IntegrationCard
          title="E-post (Resend)"
          status={resendSet && emailFromSet ? "ok" : resendSet ? "partial" : "off"}
          badge={resendSet ? (emailFromSet ? "Aktiv" : "Mangler avsender") : "Ikke satt"}
        >
          {resendSet
            ? emailFromSet
              ? "Sender bekreftelser, påminnelser og lønnsoversikter."
              : "RESEND_API_KEY er satt, men EMAIL_FROM mangler (må verifiseres for domenet)."
            : "Sett RESEND_API_KEY + EMAIL_FROM i Vercel."}
        </IntegrationCard>

        <IntegrationCard
          title="Betaling (Vipps)"
          status={vippsMode === "production" ? "ok" : vippsMode === "test" ? "partial" : "off"}
          badge={vippsMode === "production" ? "Produksjon" : vippsMode === "test" ? "Test" : "Mock"}
        >
          {vippsMode === "mock"
            ? "Kjører i mock-modus. Sett opp og test nedenfor (nøkler i Vercel)."
            : `Vipps er i ${vippsMode}-modus. Test nedenfor.`}
        </IntegrationCard>

      </div>

      {/* Vipps – status + test av nøklene fra Vercel */}
      <VippsCard
        mode={vippsMode}
        vars={vippsVars}
        envValue={process.env.VIPPS_ENV ?? ""}
      />

      {/* Tripletex – test + bilagsforhåndsvisning */}
      <TripletexCard
        configured={tripletexConfigured()}
        postingEnabled={TRIPLETEX.postingEnabled}
        env={TRIPLETEX.env}
      />

      {/* Varsling ved ny booking */}
      <div id="varsling" className="border border-line bg-surface p-6">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold">Varsling ved ny booking</h2>
          <p className="mt-1 text-sm text-muted">
            Send en e-post til salongen hver gang en kunde booker på nett, med
            kunde, tid, tjeneste og evt. notat – og lenke rett til kalenderen.
          </p>
        </div>
        {sp.varsellagret && (
          <p className="mb-3 text-sm text-accent-soft">Varsling lagret ✓</p>
        )}
        {sp.varselfeil && <p className="mb-3 text-sm text-danger">{sp.varselfeil}</p>}
        <form action={saveBookingNotifyWithFeedback} className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" name="enabled" defaultChecked={notify.enabled} className="accent-accent" />
            Slå på varsling
          </label>
          <label className="text-xs text-muted">
            Send til
            <input
              type="email"
              name="email"
              defaultValue={notify.email}
              placeholder="post@downtownbarbers.no"
              className="mt-1 block w-64 border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </label>
          <SubmitButton pendingText="Lagrer …" className="act act-accent">
            Lagre
          </SubmitButton>
        </form>
      </div>

      {/* SMS-konfig */}
      <div className="border border-line bg-surface p-6">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold">SMS (GatewayAPI)</h2>
          <p className="mt-1 text-sm text-muted">
            Lag konto på gatewayapi.com, lag en API-token og lim den inn her.
            Avsendernavnet (maks 11 tegn) er det kunden ser som avsender.
            Lagre, og send en test til ditt eget nummer under «SMS-tekster».
          </p>
        </div>
        <SmsConfigForm status={sms} />
      </div>

      {/* SMS-tekster */}
      <div className="border border-line bg-surface p-6">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold">SMS-tekster</h2>
          <p className="mt-1 text-sm text-muted">
            Bestem hvordan påminnelsen kunden får dagen før timen er formulert.
            Trykk på en variabel for å sette inn navn, tid osv. – den fylles
            ut automatisk for hver kunde. Hold deg under 160 tegn, så koster
            det én SMS.
          </p>
        </div>
        <SmsTemplateForm initial={smsTpl.reminder} />
      </div>
    </div>
  );
}
