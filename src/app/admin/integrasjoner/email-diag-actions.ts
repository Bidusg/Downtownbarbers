"use server";

import { getUserRole, isAdminRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { emailFromInUse, sendTestEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/validate";

export type DiagRow = { label: string; ok: boolean; detail: string };

/**
 * «Feilsøk e-post og kundeinnlogging» i admin → Integrasjoner.
 * Sjekker det kundeinnlogging, registrering og ordrebekreftelser trenger,
 * og sender en ekte test-e-post. Viser Resend sitt eksakte svar.
 */
export async function runEmailDiagnostics(to: string): Promise<{ rows: DiagRow[] } | { error: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  const target = to.trim().toLowerCase() || me.email || "";
  if (!isValidEmail(target)) return { error: "Skriv inn en gyldig e-postadresse." };

  const rows: DiagRow[] = [];

  // 1) Service-nøkkelen (all kundeinnlogging går via den).
  let svc: ReturnType<typeof createServiceClient> | null = null;
  try {
    svc = createServiceClient();
    const { error } = await svc.from("customers").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error(error.message);
    rows.push({ label: "SUPABASE_SERVICE_ROLE_KEY", ok: true, detail: "Virker." });
  } catch (e) {
    svc = null;
    rows.push({
      label: "SUPABASE_SERVICE_ROLE_KEY",
      ok: false,
      detail: `${e instanceof Error ? e.message : e} – legg inn riktig nøkkel i Vercel (Settings → API → service_role) og redeploy.`,
    });
  }

  // 2) Tabellen for engangskoder (KJØR-I-SUPABASE-KUNDEKONTO.sql).
  if (svc) {
    const { error } = await svc.from("customer_login_codes").select("id", { head: true, count: "exact" }).limit(1);
    rows.push({
      label: "Tabellen customer_login_codes",
      ok: !error,
      detail: error
        ? `Mangler (${error.message}). Kjør KJØR-I-SUPABASE-KUNDEKONTO.sql i Supabase.`
        : "Finnes.",
    });
  }

  // 3) Avsender.
  const from = emailFromInUse();
  const testSender = /onboarding@resend\.dev/i.test(from);
  rows.push({
    label: "Avsender (EMAIL_FROM)",
    ok: !testSender,
    detail: testSender
      ? `${from} – Resend sin testavsender kan BARE sende til e-posten Resend-kontoen er registrert med. Kunder får ingenting. Verifiser downtownbarbers.no i Resend og sett EMAIL_FROM, f.eks. «Downtown Barbers <post@downtownbarbers.no>».`
      : from,
  });

  // 4) Ekte test-e-post.
  const r = await sendTestEmail(target);
  rows.push({
    label: `Test-e-post til ${target}`,
    ok: r.ok,
    detail: r.ok
      ? `${r.detail} Sjekk innboksen (og søppelpost).`
      : `Avvist${r.status ? ` (${r.status})` : ""}: ${r.detail}`,
  });

  return { rows };
}
