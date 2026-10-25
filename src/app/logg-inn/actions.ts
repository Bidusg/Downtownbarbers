"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, homeForRole } from "@/lib/auth";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { sendLoginCodeEmail, sendPortalLinkEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { createServiceClient } from "@/lib/supabase/service";
import { setCustomerSession } from "@/lib/customer-session";
import { isValidEmail, isValidNorwegianPhone, titleCase } from "@/lib/validate";
import { ipRateLimited, isHoneypotTripped } from "@/lib/abuse-guard";
import { siteUrl } from "@/lib/site-url";
import { getRequestLang } from "@/lib/i18n/server-lang";

/**
 * Basis-URL for lenker i e-post. Bygges fra den faktiske forespørselen
 * (vertsnavnet kunden er inne på) slik at lenken alltid peker til samme
 * domene de bruker nå – ikke et hardkodet domene som kanskje ikke er lansert.
 * Faller tilbake til NEXT_PUBLIC_SITE_URL hvis header mangler.
 */
async function requestBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) return `${proto}://${host}`;
  } catch {
    // ignorer – bruk fallback
  }
  return siteUrl();
}

export type LoginState = { error?: string };

export type PortalLinkState = { sent?: boolean };

/* ===================== KUNDE-INNLOGGING (engangskode) =====================
 * 1) Kunden skriver e-post (eller registrerer seg med navn/e-post/mobil).
 * 2) Finnes kunden, sendes en 6-sifret kode på e-post (gyldig 10 min).
 * 3) Riktig kode → kunden er innlogget på enheten i ett år (dtb_kunde).
 * Svarene er alltid nøytrale: vi røper aldri om en e-post finnes.
 * Alt går via service-role på serveren (koder og portal-token er aldri
 * tilgjengelige fra nettleseren).
 * ========================================================================== */

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

function hashCode(customerId: string, code: string): string {
  return createHash("sha256").update(`${customerId}:${code}`).digest("hex");
}

type Svc = ReturnType<typeof createServiceClient>;

type CustomerRef = { id: string; portal_token: string | null; email: string | null };

async function customerByEmail(svc: Svc, email: string): Promise<CustomerRef | null> {
  const esc = email.replace(/[%_\\]/g, "\\$&");
  const { data, error } = await svc
    .from("customers")
    .select("id, portal_token, email")
    .ilike("email", esc)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`customers: ${error.message}`);
  if (data) return data as CustomerRef;
  // Importerte kunder kan ha mellomrom rundt e-posten («ola@x.no »).
  // Databasen regner dem som samme e-post (unik på lower(trim(email))),
  // så de må finnes her også – ellers feiler registreringen på duplikat.
  const { data: loose } = await svc
    .from("customers")
    .select("id, portal_token, email")
    .ilike("email", `%${esc}%`)
    .order("created_at", { ascending: true })
    .limit(10);
  return (
    ((loose ?? []) as CustomerRef[]).find((c) => (c.email ?? "").trim().toLowerCase() === email) ?? null
  );
}

/** Kunder uten portal-lenke (f.eks. importerte) kan ikke logge inn – gi dem en. */
async function ensurePortal(svc: Svc, c: CustomerRef): Promise<CustomerRef> {
  if (c.portal_token) return c;
  const { data } = await svc
    .from("customers")
    .update({ portal_token: randomUUID() })
    .eq("id", c.id)
    .select("id, portal_token, email")
    .maybeSingle();
  return (data as CustomerRef | null) ?? c;
}

/** Lag og send en ny kode. Stille hvis for mange koder siste time. */
async function issueCode(
  svc: Svc,
  c: { id: string; portal_token: string | null },
  email: string,
  welcome = false,
): Promise<"sent" | "limited" | "failed"> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await svc
    .from("customer_login_codes")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", c.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_CODES_PER_HOUR) return "limited";

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await svc.from("customer_login_codes").insert({
    customer_id: c.id,
    code_hash: hashCode(c.id, code),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);

  // Koden sendes også på SMS når vi har mobilnummeret – da kommer kunden
  // inn selv om e-posten havner i søppelpost eller blir stoppet.
  let smsSent = false;
  try {
    const { data: ph } = await svc.from("customers").select("phone").eq("id", c.id).maybeSingle();
    const phone = (ph as { phone: string | null } | null)?.phone?.trim();
    if (phone) {
      const en = (await getRequestLang()) === "en";
      smsSent = await sendSms(
        phone,
        en
          ? `${code} is your Downtown Barbers login code. Valid for ${CODE_TTL_MIN} minutes.`
          : `${code} er koden din for å logge inn hos Downtown Barbers. Gjelder i ${CODE_TTL_MIN} minutter.`,
        { kind: "annet", logBody: "Innloggingskode (skjult)" },
      );
    }
  } catch {
    /* SMS er en bonus */
  }

  const base = await requestBaseUrl();
  const sent = await sendLoginCodeEmail({
    to: email,
    code,
    portalUrl: c.portal_token ? `${base}/min-side/${c.portal_token}` : undefined,
    lang: await getRequestLang(),
    welcome,
  });
  // Rydd gamle koder innimellom (billig, best-effort).
  if (Math.random() < 0.1) await svc.rpc("purge_customer_login_codes");
  if (!sent) console.error("Innloggingskode: e-posten ble ikke sendt (se feilen over).");
  return sent || smsSent ? "sent" : "failed";
}

export type CodeRequestState = {
  step?: "code";
  email?: string;
  error?: string;
  /** Tidspunkt (ms) da forespørselen ble behandlet – brukes til nedtelling i skjemaet. */
  at?: number;
  /** Ekstra beskjed: for mange koder siste time / e-posten kunne ikke sendes. */
  notice?: "limited" | "failed";
};

/** Steg 1 (eksisterende kunde): send kode til e-posten. */
export async function requestLoginCode(
  _prev: CodeRequestState,
  formData: FormData,
): Promise<CodeRequestState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "invalidEmail" };
  if (await ipRateLimited()) return { error: "rateLimited" };
  try {
    const svc = createServiceClient();
    const found = await customerByEmail(svc, email);
    const c = found ? await ensurePortal(svc, found) : null;
    const r = c ? await issueCode(svc, c, email) : "sent";
    if (r !== "sent") return { step: "code", email, at: Date.now(), notice: r };
  } catch (e) {
    console.error("requestLoginCode:", e instanceof Error ? e.message : e);
    return { error: "notConfigured" };
  }
  return { step: "code", email, at: Date.now() };
}

/** Steg 1 (ny kunde): opprett konto og send kode. */
export async function registerCustomer(
  _prev: CodeRequestState,
  formData: FormData,
): Promise<CodeRequestState> {
  if (isHoneypotTripped(formData.get("website"))) return { step: "code", email: "" };
  const name = titleCase(String(formData.get("name") ?? ""));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) return { error: "nameMissing" };
  if (!isValidEmail(email)) return { error: "invalidEmail" };
  if (phone && !isValidNorwegianPhone(phone) && !/^\+\d{6,}/.test(phone.replace(/\s/g, "")))
    return { error: "invalidPhone" };
  if (await ipRateLimited()) return { error: "rateLimited" };
  try {
    const svc = createServiceClient();
    let c = await customerByEmail(svc, email);
    let welcome = false;
    if (!c) {
      const { data, error } = await svc
        .from("customers")
        .insert({ full_name: name, email, phone: phone || null })
        .select("id, portal_token, email")
        .maybeSingle();
      if (error) {
        // Duplikat (samme e-post med annen skrivemåte, eller opprettet i samme
        // øyeblikk): bruk kunden som finnes – svaret er uansett nøytralt.
        if (error.code === "23505") c = await customerByEmail(svc, email);
        if (!c) throw new Error(`insert customers: ${error.code ?? ""} ${error.message}`);
      } else {
        c = data as CustomerRef | null;
        welcome = true;
      }
    }
    if (c) c = await ensurePortal(svc, c);
    if (c) {
      // Språkvalget følger kunden (e-post/SMS på riktig språk).
      try {
        await svc.from("customers").update({ lang: await getRequestLang() }).eq("id", c.id).is("lang", null);
      } catch {
        /* lang-kolonnen finnes kanskje ikke ennå */
      }
      const r = await issueCode(svc, c, email, welcome);
      if (r !== "sent") return { step: "code", email, at: Date.now(), notice: r };
    }
  } catch (e) {
    console.error("registerCustomer:", e instanceof Error ? e.message : e);
    return { error: "notConfigured" };
  }
  // Nøytralt: samme svar om e-posten fantes fra før eller ikke.
  return { step: "code", email, at: Date.now() };
}

export type VerifyState = { error?: string; redirect?: string };

/** Steg 2: sjekk koden og logg inn på enheten. */
export async function verifyLoginCode(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!email || code.length !== 6) return { error: "badCode" };
  if (await ipRateLimited()) return { error: "rateLimited" };
  try {
    const svc = createServiceClient();
    const c = await customerByEmail(svc, email);
    if (!c?.portal_token) return { error: "badCode" };
    const { data: row } = await svc
      .from("customer_login_codes")
      .select("id, code_hash, attempts, expires_at")
      .eq("customer_id", c.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = row as { id: string; code_hash: string; attempts: number } | null;
    if (!r || r.attempts >= MAX_ATTEMPTS) return { error: "expired" };

    const a = Buffer.from(hashCode(c.id, code));
    const b = Buffer.from(r.code_hash);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      await svc.from("customer_login_codes").update({ attempts: r.attempts + 1 }).eq("id", r.id);
      return { error: r.attempts + 1 >= MAX_ATTEMPTS ? "expired" : "badCode" };
    }
    await svc.from("customer_login_codes").update({ used_at: new Date().toISOString() }).eq("id", r.id);
    await setCustomerSession(c.portal_token);
    return { redirect: `/min-side/${c.portal_token}` };
  } catch (e) {
    console.error("verifyLoginCode:", e instanceof Error ? e.message : e);
    return { error: "notConfigured" };
  }
}

/**
 * Eldre flyt (beholdes for gamle skjema): send lenke til Min side.
 * Slår nå opp via service-role – portal_token_for_email er ikke lenger åpen.
 */
export async function requestPortalLink(
  _prev: PortalLinkState,
  formData: FormData,
): Promise<PortalLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const neutral: PortalLinkState = { sent: true };
  if (!email) return neutral;

  try {
    const svc = createServiceClient();
    const c = await customerByEmail(svc, email);
    if (c?.portal_token) {
      const base = await requestBaseUrl();
      await sendPortalLinkEmail({
        to: email,
        portalUrl: `${base}/min-side/${c.portal_token}`,
        lang: await getRequestLang(),
      });
    }
  } catch {
    // Svelg feil bevisst – aldri lekk tilstand til klienten.
  }
  return neutral;
}

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Feil e-post eller passord." };
  }

  const me = await getUserRole();
  // Tilbake dit den ansatte var på vei (f.eks. lenken til lønnsslippen).
  // Kun interne back-office-stier – aldri eksterne adresser.
  const next = String(formData.get("neste") ?? "");
  if (/^\/(admin|kasse|ansatt|revisor)(\/[A-Za-z0-9\-_/]*)?(\?[^#\s]*)?(#[\w-]*)?$/.test(next) && !next.startsWith("//")) {
    redirect(next);
  }
  redirect(homeForRole(me?.role ?? "customer"));
}
