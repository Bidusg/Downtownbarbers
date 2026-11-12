import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Felles hemmelighets-sjekk for cron-/worker-/webhook-ruter.
 * FAIL CLOSED: mangler miljøvariabelen, avvises alle kall (500) – aldri «åpen».
 */

/** Konstant-tid sammenligning av to strenger (uavhengig av lengde). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Bruk timingSafeEqual likevel så tiden ikke røper lengden unødvendig.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** true hvis `Authorization: Bearer <env>` stemmer. Falsk også når env mangler. */
export function bearerMatches(req: Request, envName: string): boolean {
  const secret = process.env[envName];
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return safeEqual(auth, `Bearer ${secret}`);
}

/**
 * Returnerer null hvis kallet er godkjent, ellers et ferdig svar (500 når
 * hemmeligheten ikke er konfigurert, 401 når den ikke stemmer).
 */
export function checkBearer(req: Request, envName: string): NextResponse | null {
  const secret = process.env[envName];
  if (!secret) {
    console.error(`${envName} mangler`);
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  if (!bearerMatches(req, envName)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
