"use server";

import { revalidatePath } from "next/cache";
import { getUserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Felles svartype for skjemaene på «Min profil». */
export type ProfilState = { ok?: boolean; error?: string; message?: string };

const PHONE_RE = /^[+0-9][0-9\s]{3,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Oppdaterer den INNLOGGEDE brukerens egne grunnopplysninger (navn + telefon)
 * i profiles. Bruker-id hentes server-side fra sesjonen (auth.uid via
 * getUserRole) – aldri fra klienten – og raden filtreres på `id = userId`.
 * RLS (profiles_self_update: id = auth.uid()) er et ekstra vern i tillegg.
 * Telefon-kolonnen kan mangle i enkelte miljøer; da degraderer vi til kun navn.
 */
export async function updateProfile(
  _prev: ProfilState,
  formData: FormData,
): Promise<ProfilState> {
  const me = await getUserRole();
  if (!me) return { error: "Du må være innlogget." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (fullName.length < 2) {
    return { error: "Navn må være minst 2 tegn." };
  }
  if (fullName.length > 120) {
    return { error: "Navn er for langt." };
  }
  if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
    return { error: "Ugyldig telefonnummer." };
  }

  try {
    const sb = await createClient();
    const phone = phoneRaw || null;

    // Først med telefon; om kolonnen ikke finnes, prøv kun navn (degrader trygt).
    let { error } = await sb
      .from("profiles")
      .update({ full_name: fullName, phone })
      .eq("id", me.userId);

    if (error && /phone/i.test(error.message)) {
      ({ error } = await sb
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", me.userId));
    }

    if (error) {
      return { error: "Kunne ikke lagre. Prøv igjen." };
    }

    revalidatePath("/min-profil");
    return { ok: true, message: "Opplysningene er lagret." };
  } catch {
    return { error: "Noe gikk galt. Prøv igjen." };
  }
}

/**
 * Setter nytt passord for den innloggede brukeren via Supabase Auth.
 * Samme mønster som /tilbakestill (supabase.auth.updateUser({ password })),
 * men her finnes allerede en vanlig sesjon, så vi logger ikke ut etterpå.
 */
export async function changePassword(
  _prev: ProfilState,
  formData: FormData,
): Promise<ProfilState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Passordet må være minst 8 tegn." };
  }
  if (password !== confirm) {
    return { error: "Passordene er ikke like." };
  }

  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { error: "Du må være innlogget." };

    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      return { error: "Kunne ikke oppdatere passordet. Prøv igjen." };
    }
    return { ok: true, message: "Passordet er oppdatert." };
  } catch {
    return { error: "Noe gikk galt. Prøv igjen." };
  }
}

/**
 * Endrer e-postadressen via Supabase Auth. Supabase sender normalt en
 * bekreftelseslenke til den nye adressen, og e-posten byttes først når den
 * bekreftes – vi forteller brukeren det. Oppdaterer IKKE profiles.email her
 * (den speiles når endringen er bekreftet). Kun egen sesjon berøres.
 */
export async function changeEmail(
  _prev: ProfilState,
  formData: FormData,
): Promise<ProfilState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { error: "Ugyldig e-postadresse." };
  }

  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return { error: "Du må være innlogget." };

    if (user.email && email === user.email.toLowerCase()) {
      return { error: "Dette er allerede e-postadressen din." };
    }

    const { error } = await sb.auth.updateUser({ email });
    if (error) {
      return { error: "Kunne ikke endre e-posten. Prøv igjen." };
    }
    return {
      ok: true,
      message:
        "Vi har sendt en bekreftelseslenke til den nye adressen. E-posten byttes når du bekrefter den.",
    };
  } catch {
    return { error: "Noe gikk galt. Prøv igjen." };
  }
}
