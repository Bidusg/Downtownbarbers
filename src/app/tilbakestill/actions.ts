"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error?: string };

/**
 * Setter nytt passord for den innloggede recovery-sesjonen. Krever at
 * /tilbakestill/bekreft allerede har opprettet en sesjon via verifyOtp.
 * Etter vellykket bytte logges brukeren ut og sendes til innlogging.
 */
export async function setNewPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Passordet må være minst 8 tegn." };
  }
  if (password !== confirm) {
    return { error: "Passordene er ikke like." };
  }

  const supabase = await createClient();

  // Krever en aktiv (recovery-)sesjon.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error:
        "Lenken er utløpt eller ugyldig. Be om en ny tilbakestillingslenke.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Kunne ikke oppdatere passordet. Prøv igjen." };
  }

  // Logg ut recovery-sesjonen og be brukeren logge inn på nytt.
  await supabase.auth.signOut();
  redirect("/logg-inn?tilbakestilt=1");
}
