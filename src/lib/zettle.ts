/**
 * Zettle (PayPal Point of Sale) – server-integrasjon.
 *
 * Zettle er den produkterklærte kassa som tar betaling. Her henter vi
 * fullførte kjøp og speiler dem inn i `external_sales` (omsetning/CRM).
 *
 * Auth: «self-hosted app» bruker JWT-assertion-grant (ingen refresh-token –
 * be om nytt token ved behov). Sett disse i miljøet når kontoen finnes:
 *   ZETTLE_CLIENT_ID   – client-id fra Zettle Developer Portal
 *   ZETTLE_API_KEY     – API-nøkkelen (JWT-streng) fra samme sted
 * Valgfritt for webhook-verifisering:
 *   ZETTLE_WEBHOOK_SIGNING_KEY
 *
 * NB: Endepunktene er Zettles offisielle verter. Feltnavn i kjøps-objektet
 * bør bekreftes mot et ekte kjøp første gang (se mapPurchase – defensiv).
 */

const OAUTH_TOKEN_URL = "https://oauth.zettle.com/token";
const PURCHASES_URL = "https://purchase.izettle.com/purchases/v2";

export type MappedSale = {
  external_id: string;
  sold_at: string; // ISO
  amount_nok: number;
  payment_type: string | null;
  products: { name: string; quantity: number; unit_price_nok: number }[];
  raw: unknown;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export function zettleConfigured(): boolean {
  return !!(process.env.ZETTLE_CLIENT_ID && process.env.ZETTLE_API_KEY);
}

/** Hent (og cache) et access-token via assertion-grant. */
export async function getZettleToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const clientId = process.env.ZETTLE_CLIENT_ID;
  const apiKey = process.env.ZETTLE_API_KEY;
  if (!clientId || !apiKey) throw new Error("Zettle er ikke konfigurert.");

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: clientId,
    assertion: apiKey,
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Zettle token-feil: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };
  return cachedToken.token;
}

type ZettlePurchase = {
  purchaseUUID?: string;
  purchaseUUID1?: string;
  uuid?: string;
  timestamp?: string;
  amount?: number; // minor units (øre)
  currency?: string;
  payments?: { type?: string; amount?: number }[];
  products?: { name?: string; quantity?: string | number; unitPrice?: number }[];
};

/** Zettle-beløp er i minste enhet (øre). */
function toNok(minor: number | undefined): number {
  return Math.round(((minor ?? 0) / 100) * 100) / 100;
}

/** Gjør et Zettle-kjøp om til vår MappedSale. Defensiv mot feltvariasjoner. */
export function mapPurchase(p: ZettlePurchase): MappedSale | null {
  const external_id = p.purchaseUUID || p.purchaseUUID1 || p.uuid || "";
  if (!external_id) return null;
  const products = (p.products ?? []).map((pr) => ({
    name: pr.name ?? "Ukjent",
    quantity: Number(pr.quantity ?? 1),
    unit_price_nok: toNok(pr.unitPrice),
  }));
  return {
    external_id,
    sold_at: p.timestamp ?? new Date().toISOString(),
    amount_nok: toNok(p.amount),
    payment_type: p.payments?.[0]?.type ?? null,
    products,
    raw: p,
  };
}

/** Hent fullførte kjøp (nyeste først). `since` begrenser på startdato. */
export async function fetchPurchases(opts?: {
  since?: Date;
  limit?: number;
}): Promise<MappedSale[]> {
  const token = await getZettleToken();
  const params = new URLSearchParams({
    limit: String(opts?.limit ?? 100),
    descending: "true",
  });
  if (opts?.since) params.set("startDate", opts.since.toISOString());

  const res = await fetch(`${PURCHASES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Zettle purchases-feil: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { purchases?: ZettlePurchase[] };
  return (data.purchases ?? [])
    .map(mapPurchase)
    .filter((m): m is MappedSale => m !== null);
}
