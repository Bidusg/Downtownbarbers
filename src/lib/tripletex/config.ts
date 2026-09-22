// Tripletex-integrasjon – konfigurasjon.
//
// Kobler Downtown Barbers til regnskapsføring i Tripletex (revisor Kumar).
// Autentisering: en API-nøkkel (JWT «API-token») opprettes i Dawits Tripletex
// (Selskap → API-tokens) og settes som TRIPLETEX_API_TOKEN. Koden bytter den
// inn i et kortlevd session-token (se client.ts) og bruker Basic auth.
//
// Miljø: test er standard til vi går live. Konto-ID-er er ULIKE i test og prod,
// så vi slår opp konto etter kontonummer ved kjøring (se voucher.ts).

export type TripletexEnv = "test" | "prod";

const ENV = (process.env.TRIPLETEX_ENV as TripletexEnv) || "test";

export const TRIPLETEX = {
  env: ENV,
  /** REST base-URL (uten etterfølgende skråstrek). */
  baseUrl:
    process.env.TRIPLETEX_BASE_URL?.replace(/\/$/, "") ||
    (ENV === "prod"
      ? "https://tripletex.no/v2"
      : "https://api-test.tripletex.tech/v2"),
  /** API-nøkkel (JWT refresh-token) fra Tripletex. Aldri eksponer til klient. */
  apiToken: process.env.TRIPLETEX_API_TOKEN || "",
  /** Levetid for session-token i sekunder (maks styres av Tripletex). */
  sessionTtlSeconds: Number(process.env.TRIPLETEX_SESSION_TTL || 3600),
  /**
   * Sikkerhetsbryter: må settes «true» før vi FAKTISK poster bilag. Uten den
   * kjører alt som dry-run (bygger og logger bilaget, poster ingenting).
   */
  postingEnabled: process.env.TRIPLETEX_POSTING_ENABLED === "true",
};

/** Har vi nok konfig til å snakke med Tripletex i det hele tatt? */
export function tripletexConfigured(): boolean {
  return TRIPLETEX.apiToken.length > 0;
}
