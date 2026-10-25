import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unsubscribeWithReceipt } from "@/lib/customer-notices";

/**
 * Ett-klikks avmelding (RFC 8058) – Gmail/Apple Mail sin «Meld av»-knapp
 * sender en POST hit via List-Unsubscribe-headeren i markedsførings-e-posten.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse(null, { status: 404 });
  try {
    await unsubscribeWithReceipt(token);
  } catch {
    const sb = await createClient();
    await sb.rpc("marketing_unsubscribe", { p_token: token });
  }
  return new NextResponse(null, { status: 200 });
}

/** Åpnes lenken i nettleseren: vis den vanlige avmeldingssiden. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/avmeld/${encodeURIComponent(token)}`, req.url));
}
