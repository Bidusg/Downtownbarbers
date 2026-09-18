"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole, getUserRole } from "@/lib/auth";
import { sendStaffCredentialsEmail } from "@/lib/email";
import { STAFF_DOCS_BUCKET } from "@/lib/staff-documents";

// Offentlig bøtte – KUN for bilder (ansattfoto/produktbilder). Kontrakter
// lagres privat i staff-docs (se createStaff), aldri her.
const BUCKET = "staff-files";

/** Genererer et sterkt midlertidig passord (min. 14 tegn, blandet). */
function generateTempPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz"; // uten l/o for lesbarhet
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // uten I/O
  const digits = "23456789"; // uten 0/1
  const symbols = "!@#$%*?-";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return set[buf[0] % set.length];
  };
  // Garanter minst ett tegn fra hver klasse, fyll så opp til 16.
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 16) chars.push(pick(all));
  // Fisher–Yates-stokking med kryptografisk tilfeldighet.
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function loginUrl(): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://downtownbarbers.no";
  return `${site}/logg-inn`;
}

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Oppretter en innlogging for en ansatt: lager auth-bruker med et midlertidig
 * passord, kobler profil (role='staff') og staff-raden, og sender legitimasjon
 * på e-post. Kun admin. Bruker service-role-klienten (kun server-side).
 */
export async function createStaffLogin(staffId: string): Promise<ActionResult> {
  await requireRole(["admin"]);

  const svc = createServiceClient();

  // Hent ansatt – må ha e-post.
  const { data: staff, error: staffErr } = await svc
    .from("staff")
    .select("id, full_name, email, profile_id")
    .eq("id", staffId)
    .single();

  if (staffErr || !staff) {
    return { ok: false, error: "Fant ikke den ansatte." };
  }
  if (staff.profile_id) {
    return { ok: false, error: "Denne ansatte har allerede en innlogging." };
  }
  const email = (staff.email ?? "").trim().toLowerCase();
  if (!email) {
    return {
      ok: false,
      error: "Ansatt mangler e-post. Legg til e-post før du oppretter innlogging.",
    };
  }

  const tempPassword = generateTempPassword();

  // 1) Opprett auth-bruker (bekreftet, så de kan logge inn umiddelbart).
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? "").toLowerCase();
    if (msg.includes("already") && msg.includes("registered")) {
      return {
        ok: false,
        error:
          "En bruker med denne e-posten finnes allerede. Koble kontoen manuelt, eller bruk en annen e-post.",
      };
    }
    return { ok: false, error: "Kunne ikke opprette innlogging. Prøv igjen." };
  }

  const userId = created.user.id;

  // 2) Sett rolle 'staff' på profilen (trigger har opprettet raden).
  const { error: profErr } = await svc
    .from("profiles")
    .update({ role: "staff", full_name: staff.full_name, email })
    .eq("id", userId);
  if (profErr) {
    // Rydd opp: fjern den nyopprettede brukeren for å unngå halvferdig tilstand.
    await svc.auth.admin.deleteUser(userId);
    return { ok: false, error: "Kunne ikke sette rolle for brukeren. Prøv igjen." };
  }

  // 3) Koble staff-raden til den nye brukeren.
  const { error: linkErr } = await svc
    .from("staff")
    .update({ profile_id: userId })
    .eq("id", staffId);
  if (linkErr) {
    await svc.auth.admin.deleteUser(userId);
    return { ok: false, error: "Kunne ikke koble ansatt til innlogging. Prøv igjen." };
  }

  // 4) Send legitimasjon på e-post (best effort – blokkerer ikke suksess).
  await sendStaffCredentialsEmail({
    to: email,
    name: staff.full_name,
    email,
    tempPassword,
    loginUrl: loginUrl(),
  });

  revalidatePath("/admin/ansatte");
  return { ok: true };
}

/**
 * Re-genererer et midlertidig passord for en ansatt som allerede har innlogging,
 * og sender det på nytt. Kun admin.
 */
export async function resendStaffPassword(
  staffId: string,
): Promise<ActionResult> {
  await requireRole(["admin"]);

  const svc = createServiceClient();

  const { data: staff, error: staffErr } = await svc
    .from("staff")
    .select("id, full_name, email, profile_id")
    .eq("id", staffId)
    .single();

  if (staffErr || !staff) {
    return { ok: false, error: "Fant ikke den ansatte." };
  }
  if (!staff.profile_id) {
    return { ok: false, error: "Denne ansatte har ingen innlogging enda." };
  }
  const email = (staff.email ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Ansatt mangler e-post." };
  }

  const tempPassword = generateTempPassword();

  const { error: updErr } = await svc.auth.admin.updateUserById(
    staff.profile_id,
    { password: tempPassword },
  );
  if (updErr) {
    return { ok: false, error: "Kunne ikke sette nytt passord. Prøv igjen." };
  }

  await sendStaffCredentialsEmail({
    to: email,
    name: staff.full_name,
    email,
    tempPassword,
    loginUrl: loginUrl(),
  });

  revalidatePath("/admin/ansatte");
  return { ok: true };
}

async function uploadFile(
  sb: Awaited<ReturnType<typeof createClient>>,
  file: File | null,
  prefix: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) return null;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function createStaff(formData: FormData) {
  await requireRole(["admin"]);
  const sb = await createClient();
  const me = await getUserRole();

  // Foto er offentlig (vises på nettsiden) → staff-files.
  const photo_url = await uploadFile(
    sb,
    formData.get("photo") as File | null,
    "photos",
  );

  const { data: inserted, error } = await sb
    .from("staff")
    .insert({
      employee_number: String(formData.get("employee_number") ?? "") || null,
      full_name: String(formData.get("full_name") ?? ""),
      title: String(formData.get("title") ?? "") || null,
      bio: String(formData.get("bio") ?? "") || null,
      postnummer: String(formData.get("postnummer") ?? "").trim() || null,
      photo_url,
      contract_url: null, // kontrakt lagres privat, ikke som offentlig URL
      active: true,
    })
    .select("id")
    .single();

  // Kontrakt → PRIVAT staff-docs + staff_documents-rad (aldri offentlig bøtte).
  const contract = formData.get("contract") as File | null;
  if (!error && inserted && contract && contract.size > 0 && me) {
    const ext = (contract.name.split(".").pop() || "pdf").toLowerCase();
    const path = `${inserted.id}/${crypto.randomUUID()}-kontrakt.${ext}`;
    const { error: upErr } = await sb.storage
      .from(STAFF_DOCS_BUCKET)
      .upload(path, contract, {
        upsert: false,
        contentType: contract.type || undefined,
      });
    if (!upErr) {
      await sb.from("staff_documents").insert({
        staff_id: inserted.id,
        category: "kontrakt",
        name: contract.name,
        path,
        size_bytes: contract.size,
        mime: contract.type || null,
        uploaded_by: me.userId,
        by_staff: false,
      });
    }
  }
  revalidatePath("/admin/ansatte");
}

/**
 * Setter/endrer postnummer på en ansatt. Postnummeret brukes som passord til
 * den passordbeskyttede ZIP-en lønnslippen sendes i. Tom verdi nullstiller.
 * Kun admin.
 */
export async function setStaffPostnummer(
  id: string,
  postnummer: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const value = postnummer.trim();
  if (value && !/^\d{4}$/.test(value)) {
    return { error: "Postnummer må være 4 siffer." };
  }
  const sb = await createClient();
  const { error } = await sb
    .from("staff")
    .update({ postnummer: value || null })
    .eq("id", id);
  if (error) {
    console.error("setStaffPostnummer failed:", error);
    return { error: `Kunne ikke lagre postnummer: ${error.message}` };
  }
  revalidatePath("/admin/ansatte");
  return { ok: true };
}

export async function toggleStaff(id: string, active: boolean) {
  const sb = await createClient();
  await sb.from("staff").update({ active }).eq("id", id);
  revalidatePath("/admin/ansatte");
}

/** Setter 4-sifret stemplings-PIN for en ansatt (via sikker RPC). */
export async function setStaffPin(
  id: string,
  pin: string,
): Promise<{ ok?: true; error?: string }> {
  if (!/^\d{4}$/.test(pin)) return { error: "PIN må være 4 siffer." };
  const sb = await createClient();
  const { error } = await sb.rpc("set_staff_pin", { p_staff: id, p_pin: pin });
  if (error) {
    console.error("set_staff_pin failed:", error);
    return { error: `Kunne ikke lagre PIN: ${error.message}` };
  }
  revalidatePath("/admin/ansatte");
  return { ok: true };
}
