import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { getSmsConfigAdmin } from "@/lib/sms";
import { getReviewConfigAdmin } from "@/lib/reviews";
import { getTurnusAnchor } from "@/lib/ops-queries";

/* =====================================================================
 * GO-LIVE-SJEKKLISTE
 *   Samlet lanseringsstatus: én live-sjekk per integrasjon/konfig, med
 *   hva som gjenstår og hvem som må gjøre det. Alt degraderer trygt.
 *
 *   status:  ok      – klart
 *            action  – Kidus kan fikse nå (nøkkel/innstilling/knapp)
 *            blocked – venter på tredjepart (domene/Resend, Dawit/Vipps)
 *            info    – opplysning / anbefaling
 * ===================================================================== */

export type CheckStatus = "ok" | "action" | "blocked" | "info";
export type Check = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hint?: string;
  owner?: string; // hvem gjør det
};
export type ChecklistGroup = { title: string; checks: Check[] };

const has = (v: string | undefined | null) => Boolean(v && String(v).trim());

export async function getGoLiveChecklist(): Promise<{
  groups: ChecklistGroup[];
  summary: { ok: number; action: number; blocked: number; total: number };
}> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const resendKey = has(process.env.RESEND_API_KEY);
  const emailFrom = has(process.env.EMAIL_FROM);
  const serviceRole = has(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const cronSecret = has(process.env.CRON_SECRET);
  const vippsMode = config.vipps.mode;

  // Parallelle oppslag (degraderer til trygge defaults ved feil).
  const [sms, review, anchor, contractsPublic, saftSet] = await Promise.all([
    getSmsConfigAdmin().catch(() => null),
    getReviewConfigAdmin().catch(() => null),
    getTurnusAnchor().catch(() => null),
    countPublicContracts(),
    saftCompanySet(),
  ]);

  const isVercelDomain = siteUrl.includes(".vercel.app");
  const customDomain = has(siteUrl) && !isVercelDomain;

  const groups: ChecklistGroup[] = [
    {
      title: "Lansering (kritisk sti)",
      checks: [
        {
          key: "domain",
          label: "Domene",
          status: customDomain ? "ok" : has(siteUrl) ? "action" : "blocked",
          detail: customDomain
            ? `Eget domene satt: ${siteUrl}`
            : has(siteUrl)
              ? `Bruker midlertidig URL: ${siteUrl}`
              : "NEXT_PUBLIC_SITE_URL er ikke satt — e-postlenker blir døde.",
          hint: customDomain
            ? undefined
            : "Sett NEXT_PUBLIC_SITE_URL = https://downtownbarbers-2kfc.vercel.app nå, og koble downtownbarbers.no når den som styrer nettsiden har forklart oppsettet.",
          owner: "Kidus / tredjepart",
        },
        {
          key: "email",
          label: "E-post (Resend)",
          status: resendKey && emailFrom ? "ok" : resendKey ? "blocked" : "blocked",
          detail:
            resendKey && emailFrom
              ? "Utsending klar (bekreftelser, påminnelser, lønnslipp, innlogging)."
              : resendKey
                ? "RESEND_API_KEY satt, men EMAIL_FROM mangler — krever verifisert avsenderdomene."
                : "RESEND_API_KEY + EMAIL_FROM mangler. Hele ansatt-e-postløpet (brukeropprettelse, passord-reset, lønnslipp) er blokkert til dette er på plass.",
          hint:
            resendKey && emailFrom
              ? undefined
              : "Verifiser avsenderdomenet i Resend (venter på domene-oppsettet), sett så EMAIL_FROM.",
          owner: "Kidus / tredjepart",
        },
        {
          key: "service_role",
          label: "Supabase service-role",
          status: serviceRole ? "ok" : "action",
          detail: serviceRole
            ? "Server-til-server-nøkkel er satt (webhooks, cron, SMS-utsending)."
            : "SUPABASE_SERVICE_ROLE_KEY mangler i Vercel — webhooks/cron/SMS vil ikke virke.",
          hint: serviceRole ? undefined : "Lim inn service_role-nøkkelen i Vercel-env.",
          owner: "Kidus",
        },
      ],
    },
    {
      title: "Integrasjoner",
      checks: [
        {
          key: "sms",
          label: "SMS",
          status: sms?.configured ? "ok" : "action",
          detail: sms?.configured
            ? `Aktiv via ${sms.effectiveProvider} (avsender: ${sms.sender}).`
            : "Ingen SMS-leverandør satt opp.",
          hint: sms?.configured ? undefined : "Konfigurer på /admin/integrasjoner (GatewayAPI anbefalt) og test.",
          owner: "Kidus",
        },
        {
          key: "reviews",
          label: "Omdømme (Google / TripAdvisor)",
          status: review?.googleKeySet || review?.taKeySet ? "ok" : "action",
          detail:
            review?.googleKeySet || review?.taKeySet
              ? `Tilkoblet${review?.googleKeySet ? " Google" : ""}${review?.taKeySet ? " TripAdvisor" : ""}.`
              : "Ingen live-anmeldelseskilder tilkoblet (kun egne kunder telles).",
          hint: review?.googleKeySet || review?.taKeySet ? undefined : "Lim inn Google Places-nøkkel + Place-ID på /admin/rating.",
          owner: "Kidus",
        },
        {
          key: "vipps",
          label: "Betaling (Vipps)",
          status: vippsMode === "production" ? "ok" : vippsMode === "test" ? "info" : "blocked",
          detail:
            vippsMode === "production"
              ? "Vipps i produksjon."
              : vippsMode === "test"
                ? "Vipps i test-modus."
                : "Vipps i mock-modus (ingen ekte betaling).",
          hint: vippsMode === "mock" ? "Venter på at Dawit velger betalingsleverandør; sett så VIPPS_*-nøklene." : undefined,
          owner: "Dawit",
        },
      ],
    },
    {
      title: "Data & konfig",
      checks: [
        {
          key: "contracts_public",
          label: "Kontrakter i privat lagring",
          status: contractsPublic === 0 ? "ok" : "action",
          detail:
            contractsPublic === 0
              ? "Ingen kontrakter ligger i den offentlige bøtta."
              : `${contractsPublic} kontrakt(er) ligger fortsatt i den offentlige bøtta.`,
          hint: contractsPublic === 0 ? undefined : "Kjør «Flytt gamle kontrakter til privat» på /admin/ansattdokumenter.",
          owner: "Kidus",
        },
        {
          key: "saft_company",
          label: "SAF-T firmafelt",
          status: saftSet ? "ok" : "action",
          detail: saftSet
            ? "Firmafelt for SAF-T er satt."
            : "Bruker standard/fallback firmafelt (org.nr, adresse).",
          hint: saftSet ? undefined : "Sett settings-nøkkelen saft_company (org.nr, adresse, postnr) før offisiell SAF-T-innsending.",
          owner: "Kidus",
        },
        {
          key: "turnus_anchor",
          label: "Turnus A/B-anker",
          status: anchor ? "ok" : "info",
          detail: anchor
            ? `A/B-anker satt (partallsuke = ${anchor.aIsEven ? "uke A" : "uke B"}).`
            : "Bruker standard A/B-anker.",
          hint: anchor ? undefined : "Bekreft A/B-ankeret på turnussiden hvis uke A/B ikke stemmer.",
          owner: "Kidus",
        },
        {
          key: "cron_secret",
          label: "Cron-sikring",
          status: cronSecret ? "ok" : "info",
          detail: cronSecret
            ? "CRON_SECRET satt — cron-endepunktene er beskyttet."
            : "CRON_SECRET ikke satt — cron-endepunktene er åpne (påminnelser/oppfølging kjører fortsatt).",
          hint: cronSecret ? undefined : "Anbefalt: sett CRON_SECRET i Vercel for å låse /api/cron/*.",
          owner: "Kidus",
        },
      ],
    },
  ];

  let ok = 0;
  let action = 0;
  let blocked = 0;
  let total = 0;
  for (const g of groups) {
    for (const c of g.checks) {
      total++;
      if (c.status === "ok") ok++;
      else if (c.status === "action") action++;
      else if (c.status === "blocked") blocked++;
    }
  }

  return { groups, summary: { ok, action, blocked, total } };
}

/** Antall ansatte med kontrakt fortsatt i den offentlige bøtta. */
async function countPublicContracts(): Promise<number> {
  try {
    const sb = await createClient();
    const { count } = await sb
      .from("staff")
      .select("*", { count: "exact", head: true })
      .not("contract_url", "is", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Er SAF-T firmafelt satt i settings ('saft_company' med org.nr)? */
async function saftCompanySet(): Promise<boolean> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("settings")
      .select("value")
      .eq("key", "saft_company")
      .maybeSingle();
    const v = (data?.value ?? null) as { orgnr?: string } | null;
    return Boolean(v && has(v.orgnr));
  } catch {
    return false;
  }
}
