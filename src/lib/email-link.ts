import crypto from "node:crypto";
import zlib from "node:zlib";
import { siteUrl } from "@/lib/site-url";
import type { Lang } from "@/lib/i18n/dictionary";

/* =====================================================================
 * SPRÅKLENKE I E-POST («Read in English» / «Les på norsk»)
 *   E-postklienter kjører ikke kode, så en ekte bryter er umulig. I stedet
 *   får hver kunde-e-post en lenke til /e/<token>, som viser SAMME e-post
 *   på det andre språket i nettleseren og husker valget på kunden.
 *
 *   Tokenet er kryptert (AES-256-GCM) – innholdet (navn, tjeneste …) kan
 *   ikke leses eller endres av andre. Nøkkel: EMAIL_LINK_SECRET, ellers
 *   service-role-nøkkelen. Mangler begge, sendes e-posten uten lenke.
 * ===================================================================== */

export type EmailKind = "bc" | "rc" | "ns" | "rm" | "pl" | "lc" | "mk";

export type EmailLinkPayload = {
  k: EmailKind;
  /** Språket lenken viser e-posten på. */
  l: Lang;
  /** Mottakeren – språkvalget lagres på kunden med denne e-posten. */
  to: string;
  /** Data e-posten lages fra (rådata, før oversetting). */
  d: Record<string, unknown>;
  /** Utløper (ms). */
  x: number;
};

const TTL_MS = 180 * 24 * 3600_000; // et halvt år

function key(): Buffer | null {
  const raw =
    process.env.EMAIL_LINK_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!raw) return null;
  return crypto.createHash("sha256").update(`dtb-email-link:${raw}`).digest();
}

const b64u = (b: Buffer) => b.toString("base64url");

export function makeEmailToken(p: Omit<EmailLinkPayload, "x">, ttlMs = TTL_MS): string | null {
  const k = key();
  if (!k) return null;
  try {
    const json = Buffer.from(JSON.stringify({ ...p, x: Date.now() + ttlMs }), "utf8");
    const packed = zlib.deflateRawSync(json, { level: 9 });
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", k, iv);
    const enc = Buffer.concat([c.update(packed), c.final()]);
    return b64u(Buffer.concat([iv, c.getAuthTag(), enc]));
  } catch {
    return null;
  }
}

export function readEmailToken(t: string): EmailLinkPayload | null {
  const k = key();
  if (!k || !t || t.length > 6000) return null;
  try {
    const buf = Buffer.from(t, "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
    d.setAuthTag(tag);
    const packed = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    const p = JSON.parse(zlib.inflateRawSync(packed).toString("utf8")) as EmailLinkPayload;
    if (!p || typeof p !== "object" || !p.k || (p.l !== "no" && p.l !== "en")) return null;
    if (typeof p.x !== "number" || p.x < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export const otherLang = (l: Lang | undefined): Lang => (l === "en" ? "no" : "en");

/** Lenke som viser e-posten på `lang`. null hvis nøkkel mangler. */
export function emailViewUrl(
  k: EmailKind,
  d: Record<string, unknown>,
  lang: Lang,
  to: string,
  ttlMs?: number,
): string | null {
  const t = makeEmailToken({ k, l: lang, to, d }, ttlMs);
  return t ? `${siteUrl()}/e/${t}` : null;
}
