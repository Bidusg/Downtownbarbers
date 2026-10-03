// Tripletex-klient: session-token-håndtering + autentiserte kall.
//
// Flyt (intern integrasjon): API-nøkkelen (JWT) byttes inn i et kortlevd
// session-token via POST /token/session/:createFromRefreshToken. Session-token
// brukes så med Basic auth: brukernavn "0", passord = session-token.
// Docs: https://developer.tripletex.no/docs/documentation/authentication-and-tokens/

import { TRIPLETEX, tripletexConfigured } from "./config";

type CachedSession = { token: string; expiresAt: number };
let cached: CachedSession | null = null;
// Delt «under opprettelse»-løfte. Synken fyrer av flere Tripletex-kall samtidig
// (Promise.all), og på kald cache ville hver enkelt ellers POSTe
// createFromRefreshToken parallelt – det avviser Tripletex med 409
// RevisionException (optimistisk låsing, kode 8000). Vi deler derfor ÉN
// token-opprettelse mellom alle samtidige kallere.
let inflight: Promise<string> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** POST createFromRefreshToken med bounded retry på 409 (RevisionException). */
async function createSessionToken(): Promise<string> {
  const url = `${TRIPLETEX.baseUrl}/token/session/:createFromRefreshToken`;
  let lastErr = "";
  // Opptil 3 forsøk: 409-konflikt på session-ressursen er forbigående.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshToken: TRIPLETEX.apiToken,
        ttlSeconds: TRIPLETEX.sessionTtlSeconds,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { value?: { token?: string } };
      const token = json?.value?.token;
      if (!token) throw new Error("Tripletex ga ikke noe session-token.");
      return token;
    }
    const body = await res.text().catch(() => "");
    lastErr = `Tripletex session-token feilet (${res.status}): ${body.slice(0, 300)}`;
    // Kun 409 (RevisionException / låsekonflikt) er verdt å prøve på nytt.
    if (res.status !== 409 || attempt === 2) break;
    await sleep(300 * (attempt + 1));
  }
  throw new Error(lastErr || "Tripletex session-token feilet.");
}

/** Hent (eller gjenbruk) et gyldig session-token. */
async function getSessionToken(): Promise<string> {
  if (!tripletexConfigured()) {
    throw new Error("Tripletex ikke konfigurert (mangler TRIPLETEX_API_TOKEN).");
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  // Del samtidig token-opprettelse: første kaller starter, resten venter på
  // samme løfte i stedet for å POSTe parallelt.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const token = await createSessionToken();
      cached = {
        token,
        expiresAt: Date.now() + TRIPLETEX.sessionTtlSeconds * 1000,
      };
      return token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
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

/**
 * Enkel tilkoblingstest: verifiserer sesjonen via /token/session/>whoAmI
 * (den offisielle «hvem er jeg»-ruten) og henter selskapsnavnet fra
 * companyId. Returnerer ok/feil.
 */
export async function tripletexPing(): Promise<
  { ok: true; company: string } | { ok: false; error: string }
> {
  try {
    const who = await tripletexFetch<{
      value?: { companyId?: number; employeeId?: number };
    }>("/token/session/>whoAmI");
    const companyId = who?.value?.companyId;
    let company = "(tilkoblet)";
    if (companyId) {
      company = `selskap #${companyId}`;
      try {
        const c = await tripletexFetch<{ value?: { name?: string } }>(
          `/company/${companyId}`,
        );
        if (c?.value?.name) company = c.value.name;
      } catch {
        // behold selskap-id hvis navneoppslag feiler
      }
    }
    return { ok: true, company };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
