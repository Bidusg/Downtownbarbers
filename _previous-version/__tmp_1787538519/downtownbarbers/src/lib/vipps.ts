/**
 * Vipps MobilePay ePayment-klient (kun server).
 * Tre modus (valgt automatisk i config.ts): mock / test / production.
 * Mock kjører den EKTE kodebanen (create → redirect → confirm) simulert,
 * så flyten er identisk med go-live. Kun booking-betaling.
 * (Gjenbrukt fra tidligere app-versjon.)
 */

import { config } from "./config";

export interface CreatePaymentInput {
  bookingId: string;
  amountOre: number; // 45000 = 450 kr
  description: string;
  phoneNumber?: string;
}

export interface CreatePaymentResult {
  redirectUrl: string;
  reference: string;
  mode: "mock" | "test" | "production";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${config.vipps.apiBase}/accesstoken/get`, {
    method: "POST",
    headers: {
      client_id: config.vipps.clientId,
      client_secret: config.vipps.clientSecret,
      "Ocp-Apim-Subscription-Key": config.vipps.subscriptionKey,
      "Merchant-Serial-Number": config.vipps.merchantSerialNumber,
    },
  });
  if (!res.ok) throw new Error(`Vipps auth failed: ${res.status}`);
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: now + Number(json.expires_in) * 1000,
  };
  return cachedToken.token;
}

function vippsHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": config.vipps.subscriptionKey,
    "Merchant-Serial-Number": config.vipps.merchantSerialNumber,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  };
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const reference = `booking-${input.bookingId}`;

  if (config.vipps.mode === "mock") {
    const url = new URL("/api/vipps/webhook", config.baseUrl);
    url.searchParams.set("mock", "1");
    url.searchParams.set("reference", reference);
    return { redirectUrl: url.toString(), reference, mode: "mock" };
  }

  const token = await getAccessToken();
  const returnUrl = new URL("/booking/bekreftelse", config.baseUrl);
  returnUrl.searchParams.set("ref", reference);

  const res = await fetch(`${config.vipps.apiBase}/epayment/v1/payments`, {
    method: "POST",
    headers: vippsHeaders(token),
    body: JSON.stringify({
      amount: { currency: "NOK", value: input.amountOre },
      paymentMethod: { type: "WALLET" },
      customer: input.phoneNumber
        ? { phoneNumber: input.phoneNumber }
        : undefined,
      reference,
      returnUrl: returnUrl.toString(),
      userFlow: "WEB_REDIRECT",
      paymentDescription: input.description,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vipps createPayment failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  return { redirectUrl: json.redirectUrl, reference, mode: config.vipps.mode };
}

export async function capturePayment(
  reference: string,
  amountOre: number,
): Promise<void> {
  if (config.vipps.mode === "mock") return;
  const token = await getAccessToken();
  const res = await fetch(
    `${config.vipps.apiBase}/epayment/v1/payments/${encodeURIComponent(reference)}/capture`,
    {
      method: "POST",
      headers: vippsHeaders(token),
      body: JSON.stringify({
        modificationAmount: { currency: "NOK", value: amountOre },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vipps capture failed: ${res.status} ${body}`);
  }
}

/** Booking-id fra en Vipps-referanse (booking-<uuid>). */
export function bookingIdFromReference(reference: string): string {
  return reference.replace(/^booking-/, "");
}
