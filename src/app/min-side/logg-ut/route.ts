import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_COOKIE, CUSTOMER_FLAG } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

/** Logg kunden ut på denne enheten (POST fra knapp; GET for enkle lenker). */
function logout(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.delete(CUSTOMER_COOKIE);
  res.cookies.delete(CUSTOMER_FLAG);
  return res;
}
export const POST = logout;
export const GET = logout;
