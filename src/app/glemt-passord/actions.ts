"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { sendPasswordResetEmail } from "@/lib/email";

export type ForgotState = { sent?: boolean };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://downtownbarbers.no"
  );
}

/**
 * Ber om tilbakestilling av passord. Svaret er ALLTID nøytralt – vi lekker
 * aldri om en e-post finnes. Bruker service-role-klienten (kun server-side)
 * til å generere en recovery-lenke, og sender den via Resend.
 *
 * Vi bygger vår egen lenke fra `hashed_token` (token_hash) i stedet for å
 * sende det rå `action_link`: @supabase/ssr bruker PKCE-flyt, og en
 * admin-generert lenke har ingen code_verifier i nettleseren, så
 * exchangeCodeForSession ville feilet. verifyOtp med token_hash er den
 * robuste flyten her (se /tilbakestill/bekreft).
 */
export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  // Alltid nøytralt svar – uansett hva som skjer under.
  const neutral: ForgotState = { sent: true };

  if (!email) return neutral;

  try {
    const svc = createServiceClient();
    const { data, error } = await svc.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteUrl()}/tilbakestill` },
    });

    // Ukjent e-post e.l. -> ikke kast, svar nøytralt.
    if (error || !data?.properties?.hashed_token) {
      return neutral;
    }

    const tokenHash = data.properties.hashed_token;
    const resetUrl = `${siteUrl()}/tilbakestill/bekreft?token_hash=${encodeURIComponent(
      tokenHash,
    )}&type=recovery`;

    await sendPasswordResetEmail({ to: email, resetUrl });
  } catch {
    // Svelg feil bevisst – aldri lekk tilstand til klienten.
  }

  return neutral;
}
