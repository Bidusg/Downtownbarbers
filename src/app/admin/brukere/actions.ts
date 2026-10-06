"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { ROLES } from "@/lib/users-queries";

/**
 * Setter rolle på en bruker. Kun admin. Sperrer mot å endre egen rolle
 * (så en admin ikke kan låse seg selv ute).
 */
export async function setUserRole(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const back = (q: Record<string, string>) =>
    redirect("/admin/brukere?" + new URLSearchParams({ bruker: userId, ...q }).toString());

  if (!userId || !(ROLES as readonly string[]).includes(role)) back({ feil: "Ugyldig rolle." });

  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) back({ feil: "Kun admin kan endre roller." });
  if (me?.userId === userId) back({ feil: "Du kan ikke endre din egen rolle." });

  const sb = await createClient();
  const { data, error } = await sb
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id");
  if (error) back({ feil: "Kunne ikke lagre rollen: " + error.message });
  if (!data || data.length === 0) back({ feil: "Fant ikke brukeren, eller mangler tilgang." });
  revalidatePath("/admin/brukere");
  back({ lagret: "1" });
}

/* ------------------------- OPPRETT / SLETT BRUKER ------------------------- */

import { createServiceClient } from "@/lib/supabase/service";
import { sendStaffCredentialsEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { isValidEmail } from "@/lib/validate";

export type CreateUserResult =
  | { ok: true; email: string; tempPassword: string; emailed: boolean }
  | { ok: false; error: string };

function tempPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%*?-";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Oppretter en ny innlogging (admin/eier/kasse/revisor/ansatt) med rolle.
 * Brukeren får et midlertidig passord på e-post (og det vises én gang her),
 * og bytter selv via «Glemt passord». Kun admin/eier.
 *
 * Bakgrunn: Supabase roterer refresh-token per innlogging – når to personer
 * deler én konto (f.eks. jobb@) logger den ene den andre ut. Egen bruker
 * per person løser det.
 */
export async function createUser(
  _prev: CreateUserResult | null,
  formData: FormData,
): Promise<CreateUserResult> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { ok: false, error: "Ikke tilgang." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!isValidEmail(email)) return { ok: false, error: "Ugyldig e-postadresse." };
  if (!(ROLES as readonly string[]).includes(role) || role === "customer")
    return { ok: false, error: "Velg en gyldig rolle." };

  let svc;
  try {
    svc = createServiceClient();
  } catch {
    return { ok: false, error: "Mangler SUPABASE_SERVICE_ROLE_KEY på serveren." };
  }

  const pwd = tempPassword();
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? "").toLowerCase();
    if (msg.includes("already"))
      return { ok: false, error: "Det finnes allerede en bruker med denne e-posten." };
    return { ok: false, error: "Kunne ikke opprette brukeren. Prøv igjen." };
  }
  const userId = created.user.id;

  const { error: profErr } = await svc
    .from("profiles")
    .update({ role, email, ...(fullName ? { full_name: fullName } : {}) })
    .eq("id", userId);
  if (profErr) {
    await svc.auth.admin.deleteUser(userId);
    return { ok: false, error: "Kunne ikke sette rolle. Prøv igjen." };
  }

  let emailed = false;
  try {
    await sendStaffCredentialsEmail({
      to: email,
      name: fullName || email,
      email,
      tempPassword: pwd,
      loginUrl: `${siteUrl()}/?login=1`,
    });
    emailed = true;
  } catch {
    emailed = false;
  }

  revalidatePath("/admin/brukere");
  return { ok: true, email, tempPassword: pwd, emailed };
}

/** Sletter en innlogging (ikke din egen). Kun admin/eier. */
export async function deleteUser(userId: string): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  if (me.userId === userId) return { error: "Du kan ikke slette din egen bruker." };
  let svc;
  try {
    svc = createServiceClient();
  } catch {
    return { error: "Mangler SUPABASE_SERVICE_ROLE_KEY på serveren." };
  }
  // Løsne evt. ansatt-kobling så staff-raden består.
  await svc.from("staff").update({ profile_id: null }).eq("profile_id", userId);
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) return { error: "Kunne ikke slette brukeren." };
  revalidatePath("/admin/brukere");
  return { ok: true };
}
