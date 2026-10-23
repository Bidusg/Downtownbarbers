/* Delte konstanter for kunde-innlogging (trygg å importere i proxy/middleware
 * – ingen next/headers her). Se customer-session.ts. */

export const CUSTOMER_COOKIE = "dtb_kunde";
export const CUSTOMER_FLAG = "dtb_kunde_in";
const YEAR = 60 * 60 * 24 * 365;
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

export function isPortalToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

/** Valg for informasjonskapslene – brukes både fra cookies() og NextResponse. */
export function sessionCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    token: { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: YEAR },
    flag: { httpOnly: false, secure, sameSite: "lax" as const, path: "/", maxAge: YEAR },
  };
}

