"use server";

import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIp, isHoneypotTripped } from "@/lib/abuse-guard";
import { isValidEmail, isValidNorwegianPhone, titleCase } from "@/lib/validate";
import { CONTACT_TOPICS, sendContactAlert, sendContactReceipt } from "@/lib/email";
import { getSiteSettings } from "@/lib/site-settings";
import { getRequestLang } from "@/lib/i18n/server-lang";
import { siteUrl } from "@/lib/site-url";

/* =====================================================================
 * KONTAKTSKJEMA («Send oss en melding» på forsiden)
 *   Lagres i contact_messages (admin → Henvendelser), salongen får e-post
 *   (contact@downtownbarbers.no + booking-varslingen) med kundens adresse
 *   som svar-adresse, og kunden får en kvittering.
 *   Vern: honeypot, «for rask utfylling», og maks 3 meldinger per IP per
 *   10 minutter (databasebasert).
 * ===================================================================== */

export type ContactState =
  | null
  | { ok: true }
  | { ok: false; error: "invalid" | "contact" | "rate" | "server"; fields?: string[] };

/** Kontaktmeldinger går alltid hit (i tillegg til booking-varslingen). */
const CONTACT_INBOX = "contact@downtownbarbers.no";

const MAX_PER_WINDOW = 3;
const WINDOW_MS = 10 * 60_000;

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`dtb-contact:${ip}`).digest("hex").slice(0, 32);
}

export async function sendContactMessage(_prev: ContactState, fd: FormData): Promise<ContactState> {
  // Robot? Svar «ok» uten å lagre noe.
  if (isHoneypotTripped(fd.get("website"))) return { ok: true };
  const startedAt = Number(fd.get("t") ?? 0);
  if (startedAt && Date.now() - startedAt < 2500) return { ok: true };

  const name = titleCase(String(fd.get("name") ?? "")).slice(0, 80);
  const email = String(fd.get("email") ?? "").trim().slice(0, 160);
  const phone = String(fd.get("phone") ?? "").trim().slice(0, 30);
  const message = String(fd.get("message") ?? "").trim().slice(0, 2000);
  const topicRaw = String(fd.get("topic") ?? "sporsmal");
  const topic = CONTACT_TOPICS[topicRaw] ? topicRaw : "annet";
  const callback = fd.get("callback") === "on";

  const bad: string[] = [];
  if (name.length < 2) bad.push("name");
  if (message.length < 5) bad.push("message");
  if (email && !isValidEmail(email)) bad.push("email");
  if (phone && !isValidNorwegianPhone(phone) && phone.replace(/\D/g, "").length < 8) bad.push("phone");
  if (callback && !phone) bad.push("phone");
  if (bad.length) return { ok: false, error: "invalid", fields: bad };
  if (!email && !phone) return { ok: false, error: "contact", fields: ["email", "phone"] };

  const lang = await getRequestLang();
  const ipHash = hashIp(await clientIp());

  try {
    const svc = createServiceClient();
    const { count } = await svc
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
    if ((count ?? 0) >= MAX_PER_WINDOW) return { ok: false, error: "rate" };

    const { error } = await svc.from("contact_messages").insert({
      name,
      email: email || null,
      phone: phone || null,
      topic,
      message,
      callback,
      lang,
      ip_hash: ipHash,
    });
    if (error) {
      console.error("contact_messages insert feilet:", error.message);
      return { ok: false, error: "server" };
    }

    // Varsle salongen: contact@downtownbarbers.no + mottaker for booking-varsler
    // (ellers salongens e-post).
    try {
      const { data: cfg } = await svc.from("settings").select("value").eq("key", "booking_notify").maybeSingle();
      const v = (cfg?.value ?? null) as { email?: string } | null;
      const extra = v?.email?.trim() || (await getSiteSettings()).email?.trim() || "";
      // contact@ + booking-varslingen (uten dobbel e-post hvis det er samme adresse).
      const recipients = Array.from(
        new Set([CONTACT_INBOX, extra].map((x) => x.toLowerCase()).filter((x) => x.includes("@"))),
      );
      for (const to of recipients) {
        await sendContactAlert({
          to,
          name,
          email: email || null,
          phone: phone || null,
          topic,
          message,
          callback,
          adminUrl: `${siteUrl()}/admin/henvendelser`,
        });
      }
      if (email) await sendContactReceipt({ to: email, name, callback, lang });
    } catch {
      /* e-post skal aldri velte en lagret melding */
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "server" };
  }
}
