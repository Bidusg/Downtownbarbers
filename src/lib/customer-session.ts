import { cookies } from "next/headers";

/* =====================================================================
 * KUNDE-INNLOGGING (varig)
 *   Kunden er innlogget når enheten har informasjonskapselen «dtb_kunde»
 *   med kundens portal-token (samme nøkkel som Min side-lenken). Den er
 *   httpOnly (kan ikke leses av skript) og gjelder i ett år.
 *   «dtb_kunde_in=1» er et ufarlig flagg som headeren leser for å vise
 *   «Min side» i stedet for «Logg inn».
 * ===================================================================== */

import {
  CUSTOMER_COOKIE,
  CUSTOMER_FLAG,
  isPortalToken,
  sessionCookieOptions,
} from "./customer-session-shared";

export { CUSTOMER_COOKIE, CUSTOMER_FLAG, isPortalToken, sessionCookieOptions };

/** Les token fra informasjonskapselen (server). */
export async function getCustomerToken(): Promise<string | null> {
  try {
    const v = (await cookies()).get(CUSTOMER_COOKIE)?.value;
    return isPortalToken(v) ? v : null;
  } catch {
    return null;
  }
}

/** Logg inn (server action / route handler). */
export async function setCustomerSession(token: string): Promise<void> {
  if (!isPortalToken(token)) return;
  const jar = await cookies();
  const o = sessionCookieOptions();
  jar.set(CUSTOMER_COOKIE, token, o.token);
  jar.set(CUSTOMER_FLAG, "1", o.flag);
}

/** Logg ut. */
export async function clearCustomerSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
  jar.delete(CUSTOMER_FLAG);
}
