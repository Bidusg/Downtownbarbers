"use server";

import { refreshSiteConfig } from "@/lib/site-cache-actions";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { cleanTracking, trackingInvalid } from "@/lib/tracking";
import { sendSms, getSmsConfig } from "@/lib/sms";
import { DEFAULT_SMS_TEMPLATES, SMS_VARIABLES, renderSms } from "@/lib/sms-templates";

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
    { kind: "test" },
  );
  return ok
    ? { ok: true, message: `Test-SMS sendt via ${cfg.provider} til ${to}.` }
    : {
        ok: false,
        message:
          "Kunne ikke sende. Sjekk leverandør, nøkkel, avsendernavn og nummerformat (+47…).",
      };
}

/* ------------------------ VARSLING VED NY BOOKING ------------------------ */

export type BookingNotify = { enabled: boolean; email: string };

export async function getBookingNotify(): Promise<BookingNotify> {
  try {
    const sb = await createClient();
    const { data } = await sb.from("settings").select("value").eq("key", "booking_notify").maybeSingle();
    const v = (data?.value ?? {}) as Partial<BookingNotify>;
    return { enabled: !!v.enabled, email: v.email ?? "" };
  } catch {
    return { enabled: false, email: "" };
  }
}

/** Lagre e-postvarsling ved ny nettbooking. Kun admin/eier. */
export async function saveBookingNotify(formData: FormData): Promise<void> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return;
  const enabled = formData.get("enabled") === "on";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const sb = await createClient();
  await sb
    .from("settings")
    .upsert({ key: "booking_notify", value: { enabled: enabled && !!email, email } }, { onConflict: "key" });
  revalidatePath("/admin/integrasjoner");
}


/* ------------------------------ SMS-TEKSTER ------------------------------ */

/** Lagre SMS-tekstene. Tom tekst = tilbake til standard. Kun admin. */
export async function saveSmsTemplates(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ingen tilgang." };
  const reminder = String(formData.get("reminder") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const confirmationEnabled = formData.get("confirmationEnabled") === "true";
  const reminderEn = String(formData.get("reminderEn") ?? "").trim();
  const confirmationEn = String(formData.get("confirmationEn") ?? "").trim();
  if (reminder.length > 600 || confirmation.length > 600 || reminderEn.length > 600 || confirmationEn.length > 600)
    return { error: "Teksten er for lang (maks 600 tegn)." };
  const sb = await createClient();
  const { error } = await sb.from("settings").upsert(
    {
      key: "sms_templates",
      value: {
        reminder: reminder || DEFAULT_SMS_TEMPLATES.reminder,
        confirmation: confirmation || DEFAULT_SMS_TEMPLATES.confirmation,
        confirmationEnabled,
        reminderEn: reminderEn || DEFAULT_SMS_TEMPLATES.reminderEn,
        confirmationEn: confirmationEn || DEFAULT_SMS_TEMPLATES.confirmationEn,
      },
    },
    { onConflict: "key" },
  );
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/admin/integrasjoner");
  return { ok: true };
}

/** Send en SMS-tekst (med eksempeldata) som test til et nummer. */
export async function sendTemplateTestSms(
  template: string,
  to: string,
): Promise<{ ok: boolean; message: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, message: "Kun admin." };
  if (!to.trim()) return { ok: false, message: "Skriv inn et mottakernummer." };
  const cfg = await getSmsConfig();
  if (!cfg.enabled || cfg.provider === "")
    return { ok: false, message: "Ingen SMS-leverandør er konfigurert/aktivert enda." };
  const vars = Object.fromEntries(SMS_VARIABLES.map((v) => [v.key, v.example]));
  const ok = await sendSms(to.trim(), renderSms(template, vars), { kind: "test" });
  return ok
    ? { ok: true, message: `Test sendt til ${to.trim()}.` }
    : { ok: false, message: "Kunne ikke sende. Sjekk leverandør og nummerformat (+47…)." };
}

/* ------------------------- OVERSETTELSE (DeepL) ------------------------- */

export type DeeplState = { ok: boolean; message: string } | null;

/** Lagre DeepL-nøkkel og av/på for automatisk oversettelse. Tomt nøkkelfelt beholder lagret nøkkel. */
export async function saveDeeplConfig(_prev: DeeplState, formData: FormData): Promise<DeeplState> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, message: "Kun admin." };
  const key = String(formData.get("deepl_api_key") ?? "").trim();
  if (key && (/\s/.test(key) || key.length < 20)) {
    return { ok: false, message: "Det ser ikke ut som en DeepL-nøkkel. Kopier hele nøkkelen fra deepl.com." };
  }
  const patch: Record<string, unknown> = {
    id: 1,
    auto: formData.get("auto") === "on",
    updated_at: new Date().toISOString(),
  };
  if (key) patch.deepl_api_key = key;
  const sb = await createClient();
  const { error } = await sb.from("translation_config").upsert(patch, { onConflict: "id" });
  if (error) {
    return {
      ok: false,
      message: /translation_config/.test(error.message)
        ? "Kjør KJØR-I-SUPABASE-DEEPL.sql i Supabase først."
        : "Kunne ikke lagre.",
    };
  }
  revalidatePath("/admin/integrasjoner");
  if (key) {
    const { deeplUsage } = await import("@/lib/deepl");
    try {
      await deeplUsage(key);
    } catch (e) {
      return { ok: false, message: `Lagret, men: ${(e as Error).message}` };
    }
  }
  return { ok: true, message: key ? "Lagret – nøkkelen virker." : "Lagret." };
}

/** «Oversett alt som mangler nå». */
export async function translateAllNow(_prev: DeeplState): Promise<DeeplState> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, message: "Kun admin." };
  const { translateMissing } = await import("@/lib/auto-translate");
  const r = await translateMissing();
  revalidatePath("/admin/integrasjoner");
  return { ok: r.ok, message: r.message };
}

/* ------------------------- SPORING (GA4 / Ads / Meta) ------------------------- */

export type TrackingState = { ok: boolean; message: string } | null;

/** Lagre sporings-ID-er. Tomt felt = av. Kun admin. */
export async function saveTrackingConfig(
  _prev: TrackingState,
  formData: FormData,
): Promise<TrackingState> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, message: "Ingen tilgang." };
  const raw = {
    ga4: String(formData.get("ga4") ?? ""),
    adsId: String(formData.get("adsId") ?? ""),
    adsLabel: String(formData.get("adsLabel") ?? ""),
    metaPixel: String(formData.get("metaPixel") ?? ""),
  };
  const bad = trackingInvalid(raw);
  if (bad.length) {
    const names: Record<string, string> = {
      ga4: "Google Analytics-ID (G-…)",
      adsId: "Google Ads-ID (AW-…)",
      adsLabel: "konverteringsetikett",
      metaPixel: "Meta piksel-ID (bare tall)",
    };
    return { ok: false, message: `Sjekk ${bad.map((b) => names[b]).join(", ")}.` };
  }
  const value = cleanTracking(raw);
  const sb = await createClient();
  const { error } = await sb.from("settings").upsert({ key: "tracking", value }, { onConflict: "key" });
  if (error) return { ok: false, message: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/", "layout");
  refreshSiteConfig();
  return { ok: true, message: "Lagret ✓ – cookie-banneret vises nå på nettsiden." };
}
