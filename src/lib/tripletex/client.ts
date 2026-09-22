// Tripletex-klient: session-token-håndtering + autentiserte kall.
//
// Flyt (intern integrasjon): API-nøkkelen (JWT) byttes inn i et kortlevd
// session-token via POST /token/session/:createFromRefreshToken. Session-token
// brukes så med Basic auth: brukernavn "0", passord = session-token.
// Docs: https://developer.tripletex.no/docs/documentation/authentication-and-tokens/

import { TRIPLETEX, tripletexConfigured } from "./config";

type CachedSession = { token: string; expiresAt: number };
let cached: CachedSession | null = null;

/** Hent (eller gjenbruk) et gyldig session-token. */
async function getSessionToken(): Promise<string> {
  if (!tripletexConfigured()) {
    throw new Error("Tripletex ikke konfigurert (mangler TRIPLETEX_API_TOKEN).");
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const url = `${TRIPLETEX.baseUrl}/token/session/:createFromRefreshToken`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refreshToken: TRIPLETEX.apiToken,
      ttlSeconds: TRIPLETEX.sessionTtlSeconds,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Tripletex session-token feilet (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { value?: { token?: string } };
  const token = json?.value?.token;
  if (!token) throw new Error("Tripletex ga ikke noe session-token.");
  cached = {
    token,
    expiresAt: now + TRIPLETEX.sessionTtlSeconds * 1000,
  };
  return token;
}

function authHeader(sessionToken: string): string {
  // Basic auth: brukernavn "0" (selskapskonto), passord = session-token.
  const basic = Buffer.from(`0:${sessionToken}`).toString("base64");
  return `Basic ${basic}`;
}

/** Autentisert kall mot Tripletex REST-API. Returnerer parset JSON. */
export async function tripletexFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getSessionToken();
  const url = path.startsWith("http") ? path : `${TRIPLETEX.baseUrl}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(token),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Tripletex ${init?.method ?? "GET"} ${path} feilet (${res.status}): ${body.slice(0, 400)}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Enkel tilkoblingstest: henter innlogget selskap. Returnerer ok/feil. */
export async function tripletexPing(): Promise<
  { ok: true; company: string } | { ok: false; error: string }
> {
  try {
    const json = await tripletexFetch<{ value?: { name?: string } }>(
      "/company/>",
    );
    return { ok: true, company: json?.value?.name ?? "(ukjent)" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
