import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_COOKIE, CUSTOMER_FLAG, getCustomerToken } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

/**
 * /min-side uten lenke: innlogget kunde (dtb_kunde) sendes til sin side.
 * Ikke innlogget, eller ugyldig/utgått token → innloggingen på forsiden.
 */
export async function GET(req: NextRequest) {
  const token = await getCustomerToken();
  if (token) {
    try {
      const sb = await createClient();
      const { data } = await sb.rpc("customer_portal", { p_token: token });
      const p = (Array.isArray(data) ? data[0] : data) as { full_name?: string } | null;
      if (p?.full_name) return NextResponse.redirect(new URL(`/min-side/${token}`, req.url));
    } catch {
      /* faller gjennom til innlogging */
    }
  }
  const res = NextResponse.redirect(new URL("/?login=1", req.url));
  res.cookies.delete(CUSTOMER_COOKIE);
  res.cookies.delete(CUSTOMER_FLAG);
  return res;
}
