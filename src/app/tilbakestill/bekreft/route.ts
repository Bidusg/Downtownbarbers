import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Fullfører recovery-lenken fra e-post. Lenken peker hit med
 * `token_hash` + `type=recovery`. Vi bruker verifyOtp (IKKE
 * exchangeCodeForSession) fordi lenken er admin-generert og PKCE-flyten
 * mangler en code_verifier i nettleseren. verifyOtp setter sesjons-cookies
 * via @supabase/ssr, og deretter kan brukeren sette nytt passord.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type === "recovery") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash,
    });
    if (!error) {
      // Sesjon opprettet – send til skjemaet for å velge nytt passord.
      redirect("/tilbakestill");
    }
  }

  // Ugyldig eller utløpt lenke.
  redirect("/tilbakestill?feil=ugyldig");
}
