import { NextResponse } from "next/server";
import { readEmailToken, emailViewUrl, otherLang } from "@/lib/email-link";
import { renderEmailView, renderMarketingEmail } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/service";
import { getSendTexts, loadMarketingBarbers } from "@/lib/marketing-worker";
import { siteUrl } from "@/lib/site-url";
import type { Lang } from "@/lib/i18n/dictionary";

/* =====================================================================
 * /e/<token> – e-posten i nettleseren på valgt språk
 *   Lenken «Read in English» / «Les på norsk» i kunde-e-postene peker hit.
 *   1) Viser samme e-post på det valgte språket (med lenke tilbake).
 *   2) Husker valget på kunden (customers.lang), så senere e-post og SMS
 *      kommer på det språket.
 *   3) Setter språk-cookien, så nettsiden også åpner på det språket.
 * ===================================================================== */

export const dynamic = "force-dynamic";

/** Lagre språkvalget på kunden. Feil (f.eks. før SQL-en er kjørt) ignoreres. */
async function rememberLang(lang: Lang, to: string, portalToken?: string) {
  try {
    const svc = createServiceClient();
    if (portalToken) {
      await svc.from("customers").update({ lang }).eq("portal_token", portalToken);
    } else if (to && to.includes("@")) {
      await svc.from("customers").update({ lang }).ilike("email", to.trim());
    }
  } catch {
    /* beste innsats */
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ t: string }> }) {
  const { t } = await ctx.params;
  const p = readEmailToken(t);
  if (!p) return NextResponse.redirect(siteUrl());

  let html: string | null = null;
  let portalToken: string | undefined;

  if (p.k === "mk") {
    // Markedsføring: hentes fra utsendingen (teksten er for lang til lenken).
    try {
      const svc = createServiceClient();
      const sendId = String(p.d.s ?? "");
      portalToken = String(p.d.t ?? "") || undefined;
      const { data: send } = await svc
        .from("marketing_sends")
        .select("id, subject, body, email_type, featured_barber")
        .eq("id", sendId)
        .maybeSingle();
      if (send && portalToken) {
        const base = siteUrl();
        const texts = await getSendTexts(svc, sendId, String(send.subject ?? ""), String(send.body ?? ""));
        const lang: Lang = p.l === "en" && texts.hasEn ? "en" : "no";
        const subject = lang === "en" ? texts.subjectEn! : texts.subject;
        html = renderMarketingEmail({
          subject,
          body: lang === "en" ? texts.bodyEn! : texts.body,
          unsubscribeUrl: `${base}/avmeld/${portalToken}`,
          emailType: (send.email_type as string) ?? "standard",
          barbers: await loadMarketingBarbers(svc, (send.featured_barber as string | null) ?? null, base),
          lang,
          switchUrl: texts.hasEn ? emailViewUrl("mk", p.d, otherLang(lang), p.to) : null,
        });
      }
    } catch {
      html = null;
    }
  } else {
    const switchUrl = emailViewUrl(p.k, p.d, otherLang(p.l), p.to);
    const r = await renderEmailView(p.k, p.d, p.l, switchUrl);
    html = r?.html ?? null;
  }

  if (!html) return NextResponse.redirect(siteUrl());

  await rememberLang(p.l, p.to, portalToken);

  const res = new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
  res.cookies.set("dtb_lang", p.l, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}
