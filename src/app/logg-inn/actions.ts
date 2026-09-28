"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, homeForRole } from "@/lib/auth";
import { sendPortalLinkEmail } from "@/lib/email";

export type LoginState = { error?: string };

export type PortalLinkState = { sent?: boolean };

/**
 * Passordløs kunde-innlogging: kunden skriver e-post og får (hvis den finnes)
 * en lenke til «Min side» på e-post. Svaret er ALLTID nøytralt – vi lekker
 * aldri om en e-post finnes i systemet. Bruker en SECURITY DEFINER-RPC til å
 * slå opp portal-token, og sender lenken via Resend. Trenger ikke
 * service-role-nøkkelen.
 */
export async function requestPortalLink(
  _prev: PortalLinkState,
  formData: FormData,
): Promise<PortalLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const neutral: PortalLinkState = { sent: true };
  if (!email) return neutral;

  try {
    const sb = await createClient();
    const { data: token } = await sb.rpc("portal_token_for_email", {
      p_email: email,
    });
    if (token) {
      const base =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
        "https://www.downtownbarbers.no";
      await sendPortalLinkEmail({
        to: email,
        portalUrl: `${base}/min-side/${token}`,
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
  redirect(homeForRole(me?.role ?? "customer"));
}
