"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { sendSms, getSmsConfig } from "@/lib/sms";

/**
 * Lagre SMS-leverandørkonfig. Kun admin. Nøkler oppdateres bare når det
 * faktisk skrives inn en ny verdi — tomt felt beholder den eksisterende
 * (så man slipper å lime inn på nytt). Samme mønster som review_config.
 */
export async function saveSmsConfig(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;

  const sb = await createClient();
  const t = (k: string) => String(formData.get(k) ?? "").trim();

  const patch: Record<string, unknown> = {
    id: 1,
    provider: t("provider") || null,
    sender: t("sender") || null,
    twilio_from: t("twilio_from") || null,
    generic_api_url: t("generic_api_url") || null,
    enabled: formData.get("enabled") === "on",
    updated_at: new Date().toISOString(),
  };
  // Behold eksisterende hemmeligheter hvis feltet er tomt.
  const gatewayapiToken = t("gatewayapi_token");
  const sveveUser = t("sveve_user");
  const svevePassword = t("sveve_password");
  const twilioSid = t("twilio_account_sid");
  const twilioToken = t("twilio_auth_token");
  const genericKey = t("generic_api_key");
  if (gatewayapiToken) patch.gatewayapi_token = gatewayapiToken;
  if (sveveUser) patch.sveve_user = sveveUser;
  if (svevePassword) patch.sveve_password = svevePassword;
  if (twilioSid) patch.twilio_account_sid = twilioSid;
  if (twilioToken) patch.twilio_auth_token = twilioToken;
  if (genericKey) patch.generic_api_key = genericKey;

  await sb.from("sms_config").upsert(patch, { onConflict: "id" });
  revalidatePath("/admin/integrasjoner");
}

export type TestSmsState = { ok: boolean; message: string } | null;

/**
 * Send en test-SMS til et admin-oppgitt nummer for å bekrefte at
 * leverandøren + nøkkelen virker. Admin-initiert (knappen er samtykket).
 */
export async function sendTestSms(
  _prev: TestSmsState,
  formData: FormData,
): Promise<TestSmsState> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) {
    return { ok: false, message: "Kun admin kan sende test-SMS." };
  }
  const to = String(formData.get("to") ?? "").trim();
  if (!to) return { ok: false, message: "Skriv inn et mottakernummer." };

  const cfg = await getSmsConfig();
  if (!cfg.enabled || cfg.provider === "") {
    return {
      ok: false,
      message: "Ingen SMS-leverandør er konfigurert/aktivert enda.",
    };
  }

  const ok = await sendSms(
    to,
    "Test-SMS fra Downtown Barbers. SMS-oppsettet virker ✅",
  );
  return ok
    ? { ok: true, message: `Test-SMS sendt via ${cfg.provider} til ${to}.` }
    : {
        ok: false,
        message:
          "Kunne ikke sende. Sjekk leverandør, nøkkel, avsendernavn og nummerformat (+47…).",
      };
}
