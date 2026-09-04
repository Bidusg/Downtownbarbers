import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Downtown Barbers <onboarding@resend.dev>";
  const info: Record<string, unknown> = { keyPresent: !!key, keyPrefix: key ? key.slice(0,7) : null, from };
  if (!key) return NextResponse.json({ ...info, sent:false, reason:"no key at runtime" });
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: "kidus.fisseha002@gmail.com", subject: "Debug test", html: "<p>debug</p>" }),
    });
    const body = await r.text();
    return NextResponse.json({ ...info, status: r.status, body: body.slice(0,400) });
  } catch (e) {
    return NextResponse.json({ ...info, error: String(e) });
  }
}
