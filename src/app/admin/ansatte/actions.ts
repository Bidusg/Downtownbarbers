"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole, getUserRole, isAdminRole } from "@/lib/auth";
import { sendStaffCredentialsEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
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
  return `${siteUrl()}/?login=1`;
}

type ActionResult =
  | { ok: true; tempPassword?: string; email?: string }
  | { ok: false; error: string };

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
  // Returner passordet så admin kan vise/kopiere det på skjermen – uavhengig
  // av om e-posten kommer fram (viktig ved første innlogging).
  return { ok: true, tempPassword, email };
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
  return { ok: true, tempPassword, email };
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

export async function createStaff(formData: FormData): Promise<ActionResult> {
  await requireRole(["admin"]);
  const sb = await createClient();
  const me = await getUserRole();

  const full_name = String(formData.get("full_name") ?? "").trim();
  const employee_number = String(formData.get("employee_number") ?? "").trim();
  if (!full_name) return { ok: false, error: "Navn kan ikke være tomt." };

  // Ansattnr må være unikt. Sjekk at det er ledig FØR vi evt. laster opp bilde,
  // så vi slipper foreldreløse filer når nummeret er opptatt. (Admin ser alle
  // rader via RLS, også inaktive – så gamle/sluttede ansatte fanges også opp.)
  if (employee_number) {
    const { data: existing } = await sb
      .from("staff")
      .select("id")
      .eq("employee_number", employee_number)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        error: `Ansattnr «${employee_number}» er allerede i bruk. Velg et ledig nummer.`,
      };
    }
  }

  // Foto er offentlig (vises på nettsiden) → staff-files.
  const photo_url = await uploadFile(
    sb,
    formData.get("photo") as File | null,
    "photos",
  );

  const { data: inserted, error } = await sb
    .from("staff")
    .insert({
      employee_number: employee_number || null,
      full_name,
      title: String(formData.get("title") ?? "") || null,
      email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
      bio: String(formData.get("bio") ?? "") || null,
      postnummer: String(formData.get("postnummer") ?? "").trim() || null,
      photo_url,
      contract_url: null, // kontrakt lagres privat, ikke som offentlig URL
      active: true,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // 23505 = unique_violation (ansattnr rakk å bli opptatt etter sjekken over).
    const dup =
      (error as { code?: string } | null)?.code === "23505" ||
      (error?.message ?? "").toLowerCase().includes("employee_number");
    return {
      ok: false,
      error: dup
        ? `Ansattnr «${employee_number}» er allerede i bruk. Velg et ledig nummer.`
        : `Kunne ikke lagre ansatt: ${error?.message ?? "ukjent feil"}`,
    };
  }

  // Ny ansatt leverer alle aktive tjenester som standard (juster under Rediger).
  {
    const { data: svc } = await sb.from("services").select("id").eq("active", true);
    const rows = (svc ?? []).map((r) => ({ staff_id: inserted.id as string, service_id: r.id as string }));
    if (rows.length > 0) {
      await sb.from("staff_services").upsert(rows, { onConflict: "staff_id,service_id" });
    }
  }

  // Kontrakt → PRIVAT staff-docs + staff_documents-rad (aldri offentlig bøtte).
  const contract = formData.get("contract") as File | null;
  if (inserted && contract && contract.size > 0 && me) {
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
  return { ok: true };
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

/** Norsk kontonummer: 11 siffer med MOD11-kontrollsiffer. */
function validKontonr(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
  const r = 11 - (sum % 11);
  const ctrl = r === 11 ? 0 : r;
  return ctrl !== 10 && ctrl === Number(d[10]);
}

/**
 * Rediger grunndata på en ansatt: navn, e-post, tittel, ansattnr. E-post er
 * det som trengs for å opprette innlogging. Kun admin.
 */
export async function updateStaff(
  id: string,
  fields: {
    full_name?: string;
    email?: string;
    title?: string;
    employee_number?: string;
    base_salary_nok?: string; // tom = standard grunnlønn
    display_name?: string; // navn kundene ser (tom = fullt navn)
    start_date?: string; // YYYY-MM-DD eller tom
    end_date?: string; // YYYY-MM-DD eller tom (sluttdato ved oppsigelse)
    account_number?: string; // kontonr for lønn (11 siffer), tom = fjern
  },
  opts?: { force?: boolean },
): Promise<{ ok?: true; error?: string; upcoming?: UpcomingBooking[]; afterDate?: string }> {
  await requireRole(["admin"]);
  // Ny/endret sluttdato med bookede timer etter den: stopp og vis timene.
  if (fields.end_date && /^\d{4}-\d{2}-\d{2}$/.test(fields.end_date.trim()) && !opts?.force) {
    const end = fields.end_date.trim();
    const next = new Date(`${end}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const after = next.toISOString().slice(0, 10);
    const up = await upcomingBookingsForStaff(id, after);
    if (up.bookings && up.bookings.length > 0) {
      return {
        error: `Det finnes ${up.bookings.length} bookede ${up.bookings.length === 1 ? "time" : "timer"} etter sluttdatoen.`,
        upcoming: up.bookings,
        afterDate: after,
      };
    }
  }
  // Kontonummer: valideres og lagres i lønnstabellen (salary_settings), som
  // bare admin/eier/revisor kan lese – ikke i staff, som kassa kan lese.
  let accountNumber: string | null | undefined;
  if (fields.account_number !== undefined) {
    const digits = fields.account_number.replace(/\D/g, "");
    if (digits === "") accountNumber = null;
    else if (digits.length !== 11) return { error: "Kontonummer må ha 11 siffer (f.eks. 1234.56.78901)." };
    else if (!validKontonr(digits)) return { error: "Kontonummeret er ugyldig – sjekk at sifrene stemmer." };
    else accountNumber = `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  }
  const patch: Record<string, string | number | null> = {};
  if (fields.base_salary_nok !== undefined) {
    const raw = fields.base_salary_nok.replace(/\s/g, "").replace(",", ".");
    if (raw === "") patch.base_salary_nok = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 500000)
        return { error: "Grunnlønn må være et beløp mellom 0 og 500 000." };
      patch.base_salary_nok = Math.round(n);
    }
  }
  if (fields.full_name !== undefined) {
    const v = fields.full_name.trim();
    if (!v) return { error: "Navn kan ikke være tomt." };
    patch.full_name = v;
  }
  if (fields.email !== undefined) {
    patch.email = fields.email.trim().toLowerCase() || null;
  }
  if (fields.title !== undefined) patch.title = fields.title.trim() || null;
  if (fields.display_name !== undefined)
    patch.display_name = fields.display_name.trim().slice(0, 60) || null;
  if (fields.employee_number !== undefined)
    patch.employee_number = fields.employee_number.trim() || null;
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (fields.start_date !== undefined) {
    const v = fields.start_date.trim();
    if (v && !isDate(v)) return { error: "Ugyldig startdato." };
    patch.start_date = v || null;
  }
  if (fields.end_date !== undefined) {
    const v = fields.end_date.trim();
    if (v && !isDate(v)) return { error: "Ugyldig sluttdato." };
    patch.end_date = v || null;
  }
  if (patch.start_date && patch.end_date && String(patch.end_date) < String(patch.start_date))
    return { error: "Sluttdato kan ikke være før startdato." };

  const sb = await createClient();
  if (accountNumber !== undefined) {
    const { error: accErr } = await sb
      .from("salary_settings")
      .upsert({ staff_id: id, account_number: accountNumber }, { onConflict: "staff_id" });
    // Tomt felt og lønnstabellen mangler: ikke stopp resten av lagringen.
    if (accErr && accountNumber !== null) {
      return {
        error: /account_number/.test(accErr.message)
          ? "Kontonummer krever SQL: kjør KJØR-I-SUPABASE-LONNSRAPPORT.sql i Supabase."
          : /salary_settings/.test(accErr.message)
            ? "Kontonummer krever SQL: kjør KJØR-I-SUPABASE-LONN-ANSATT.sql og KJØR-I-SUPABASE-LONNSRAPPORT.sql."
            : `Kunne ikke lagre kontonummer: ${accErr.message}`,
      };
    }
  }
  if (Object.keys(patch).length === 0) {
    revalidatePath("/admin/ansatte");
    return { ok: true };
  }
  const { error } = await sb.from("staff").update(patch).eq("id", id);
  if (error) {
    if (/start_date|end_date/.test(error.message))
      return { error: "Start-/sluttdato krever SQL: kjør KJØR-I-SUPABASE-ANSATT-START-SLUTT.sql i Supabase." };
    if (/display_name/.test(error.message))
      return { error: "Visningsnavn krever SQL: kjør KJØR-I-SUPABASE-TURNUS-FRA-DATO.sql i Supabase." };
    return { error: `Kunne ikke lagre: ${error.message}` };
  }
  revalidatePath("/admin/ansatte");
  revalidatePath("/admin/lonn");
  // Navnet vises på forsiden og i booking – oppdater dem med en gang.
  revalidatePath("/");
  revalidatePath("/booking");
  return { ok: true };
}

/**
 * Bytt/legg til profilbilde på en eksisterende ansatt (vises i Teamet på
 * forsiden, i kassa og i stemplingen). Bildet lagres i den offentlige
 * bilde-bøtta (samme som ved opprettelse).
 */
export async function updateStaffPhoto(
  id: string,
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["admin"]);
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return { error: "Velg et bilde først." };
  if (!file.type.startsWith("image/")) return { error: "Filen må være et bilde." };
  if (file.size > 5 * 1024 * 1024) return { error: "Bildet er for stort (maks 5 MB)." };
  const sb = await createClient();
  const photo_url = await uploadFile(sb, file, "photos");
  if (!photo_url) return { error: "Kunne ikke laste opp bildet. Prøv igjen." };
  const { error } = await sb.from("staff").update({ photo_url }).eq("id", id);
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  revalidatePath("/admin/ansatte");
  revalidatePath("/");
  revalidatePath("/kasse");
  return { ok: true };
}

/* ---------------- Kommende timer før deaktivering / sluttdato ---------------- */

export type UpcomingBooking = {
  id: string;
  start_at: string;
  end_at: string;
  service: string;
  customer: string;
  phone: string | null;
  email: string | null;
  status: string;
};

/**
 * Kommende timer (ikke avlyst/fullført/ikke møtt) for en ansatt fra og med
 * `fromDate` (yyyy-mm-dd, Oslo) – standard: nå. Blokkeringer uten tjeneste
 * tas ikke med. Kun admin.
 */
export async function upcomingBookingsForStaff(
  id: string,
  fromDate?: string,
): Promise<{ bookings?: UpcomingBooking[]; error?: string }> {
  await requireRole(["admin"]);
  const sb = await createClient();
  const fromIso =
    fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)
      ? new Date(
          new Date(`${fromDate}T00:00:00Z`).getTime() -
            // Oslo-midnatt ≈ UTC −1/−2 t: ta med hele dagen trygt.
            2 * 3600 * 1000,
        ).toISOString()
      : new Date().toISOString();
  const { data, error } = await sb
    .from("bookings")
    .select("id, start_at, end_at, status, service_id, services(name), customers(full_name, phone, email)")
    .eq("staff_id", id)
    .gte("start_at", fromIso)
    .in("status", ["pending", "confirmed"])
    .not("service_id", "is", null)
    .order("start_at")
    .limit(500);
  if (error) return { error: `Kunne ikke hente timer: ${error.message}` };
  const rows = (data ?? []) as unknown as {
    id: string;
    start_at: string;
    end_at: string;
    status: string;
    services: { name?: string } | null;
    customers: { full_name?: string; phone?: string | null; email?: string | null } | null;
  }[];
  const onOrAfter = (iso: string) =>
    !fromDate || new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }) >= fromDate;
  return {
    bookings: rows
      .filter((b) => onOrAfter(b.start_at))
      .map((b) => ({
        id: b.id,
        start_at: b.start_at,
        end_at: b.end_at,
        service: b.services?.name ?? "Time",
        customer: b.customers?.full_name ?? "Ukjent kunde",
        phone: b.customers?.phone ?? null,
        email: b.customers?.email ?? null,
        status: b.status,
      })),
  };
}

/**
 * Flytt valgte timer fra én barber til en annen. En time flyttes bare hvis
 * mottakeren er aktiv og ikke har en annen time som overlapper. Resten
 * rapporteres som konflikter (må flyttes manuelt i kalenderen). Kun admin.
 */
export async function moveStaffBookings(
  fromId: string,
  toId: string,
  bookingIds: string[],
): Promise<{ moved?: number; conflicts?: string[]; error?: string }> {
  await requireRole(["admin"]);
  if (!toId || toId === fromId) return { error: "Velg en annen barber å flytte til." };
  const ids = Array.from(new Set((bookingIds ?? []).filter(Boolean)));
  if (!ids.length) return { error: "Ingen timer valgt." };
  const sb = await createClient();
  const { data: target } = await sb.from("staff").select("id, active, full_name").eq("id", toId).maybeSingle();
  if (!target || target.active === false) return { error: "Barberen du flytter til er ikke aktiv." };

  const { data: rows, error } = await sb
    .from("bookings")
    .select("id, start_at, end_at, staff_id")
    .in("id", ids)
    .eq("staff_id", fromId);
  if (error) return { error: `Kunne ikke hente timene: ${error.message}` };

  let moved = 0;
  const conflicts: string[] = [];
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("nb-NO", {
      timeZone: "Europe/Oslo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  for (const b of (rows ?? []) as { id: string; start_at: string; end_at: string }[]) {
    const { data: clash } = await sb
      .from("bookings")
      .select("id")
      .eq("staff_id", toId)
      .not("status", "in", "(cancelled,no_show)")
      .lt("start_at", b.end_at)
      .gt("end_at", b.start_at)
      .limit(1);
    if (clash && clash.length) {
      conflicts.push(`${fmt(b.start_at)} – ${target.full_name} er opptatt`);
      continue;
    }
    const { error: upErr } = await sb.from("bookings").update({ staff_id: toId }).eq("id", b.id).eq("staff_id", fromId);
    if (upErr) conflicts.push(`${fmt(b.start_at)} – ${upErr.message}`);
    else moved++;
  }
  revalidatePath("/admin/ansatte");
  revalidatePath("/admin/bookinger");
  revalidatePath("/kasse");
  return { moved, conflicts };
}

export async function toggleStaff(
  id: string,
  active: boolean,
  opts?: { force?: boolean },
): Promise<{ ok?: true; error?: string; upcoming?: UpcomingBooking[] }> {
  await requireRole(["admin"]);
  // Deaktivering med kommende timer: stopp og vis timene (med mindre admin
  // har sett lista og valgt «Deaktiver likevel»).
  if (!active && !opts?.force) {
    const up = await upcomingBookingsForStaff(id);
    if (up.bookings && up.bookings.length > 0) {
      return {
        error: `Det finnes ${up.bookings.length} kommende ${up.bookings.length === 1 ? "time" : "timer"} – flytt eller avlys dem først.`,
        upcoming: up.bookings,
      };
    }
  }
  const sb = await createClient();
  const { error } = await sb.from("staff").update({ active }).eq("id", id);
  if (error) return { error: `Kunne ikke lagre: ${error.message}` };
  // Sluttdato styrer lønna: settes til i dag når en ansatt gjøres inaktiv
  // (hvis den ikke er satt fra før), og fjernes hvis en ansatt som har sluttet
  // gjøres aktiv igjen. Feiler stille hvis kolonnen mangler (SQL ikke kjørt).
  try {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
    const { data: cur } = await sb.from("staff").select("end_date").eq("id", id).maybeSingle();
    const end = (cur as { end_date?: string | null } | null)?.end_date ?? null;
    if (!active && !end) await sb.from("staff").update({ end_date: today }).eq("id", id);
    if (active && end && end < today) await sb.from("staff").update({ end_date: null }).eq("id", id);
  } catch {
    /* ignorer */
  }
  revalidatePath("/admin/ansatte");
  revalidatePath("/admin/lonn");
  revalidatePath("/");
  revalidatePath("/booking");
  return { ok: true };
}

/**
 * Setter nivå (junior/barber/senior/master) på en ansatt. Nivået styrer prisen
 * kunden ser ved booking (pris per nivå × tjeneste). Tom verdi nullstiller
 * (faller tilbake til basispris). Kun admin/eier.
 */
export async function setStaffLevel(
  id: string,
  levelId: string | null,
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();
  const { error } = await sb
    .from("staff")
    .update({ level_id: levelId || null })
    .eq("id", id);
  if (error) return { error: `Kunne ikke lagre nivå: ${error.message}` };
  revalidatePath("/admin/ansatte");
  return { ok: true };
}

/**
 * Setter hvilke tjenester en ansatt leverer (positiv tilknytning i
 * staff_services – erstatter det gamle ekskluderingsfilteret). Erstatter hele
 * settet. Tomt sett = leverer alt (ny ansatt-standard). Kun admin/eier.
 */
export async function setStaffServices(
  id: string,
  serviceIds: string[],
): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Ikke tilgang." };
  const sb = await createClient();

  // Bytt ut hele settet: slett eksisterende, sett inn valgt.
  const { error: delErr } = await sb
    .from("staff_services")
    .delete()
    .eq("staff_id", id);
  if (delErr) return { error: `Kunne ikke lagre tjenester: ${delErr.message}` };

  const rows = Array.from(new Set(serviceIds)).map((service_id) => ({
    staff_id: id,
    service_id,
  }));
  if (rows.length > 0) {
    const { error: insErr } = await sb.from("staff_services").insert(rows);
    if (insErr) return { error: `Kunne ikke lagre tjenester: ${insErr.message}` };
  }
  revalidatePath("/admin/ansatte");
  return { ok: true };
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

/* ------------------------- REKKEFØLGE PÅ NETTSIDEN ------------------------- */

/**
 * Lagre rekkefølgen barberne vises i på nettsiden (booking + «Teamet»).
 * `ids` er aktive ansatte i ønsket rekkefølge. Kun admin.
 */
export async function saveStaffWebOrder(ids: string[]): Promise<{ ok?: true; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  const clean = Array.from(new Set((ids ?? []).filter((x) => typeof x === "string" && x)));
  if (!clean.length) return { error: "Ingen ansatte." };
  const sb = await createClient();
  for (let i = 0; i < clean.length; i++) {
    const { error } = await sb.from("staff").update({ sort_order: i + 1 }).eq("id", clean[i]);
    if (error) {
      return {
        error: /sort_order/.test(error.message)
          ? "Kjør KJØR-I-SUPABASE-REKKEFOLGE-BARBERE.sql i Supabase først."
          : "Kunne ikke lagre rekkefølgen.",
      };
    }
  }
  revalidatePath("/admin/ansatte");
  revalidatePath("/booking");
  revalidatePath("/");
  return { ok: true };
}
