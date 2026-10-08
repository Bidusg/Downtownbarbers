/**
 * Vipps MobilePay ePayment-klient (kun server).
 * Tre modus (valgt automatisk i config.ts): mock / test / production.
 * Mock kjører den EKTE kodebanen (create → redirect → confirm) simulert,
 * så flyten er identisk med go-live. Kun booking-betaling.
 * (Gjenbrukt fra tidligere app-versjon.)
 */

import { config } from "./config";

export type VippsUserFlow = "WEB_REDIRECT" | "PUSH_MESSAGE" | "QR";

export interface CreatePaymentInput {
  bookingId: string;
  amountOre: number; // 45000 = 450 kr
  description: string;
  phoneNumber?: string;
  /** Standard WEB_REDIRECT (nettbooking). Kassa bruker PUSH_MESSAGE eller QR. */
  userFlow?: VippsUserFlow;
  /** Overstyr referansen (må være unik per MSN). Standard booking-<id>. */
  reference?: string;
  /** Overstyr returUrl (kun relevant for WEB_REDIRECT). */
  returnUrl?: string;
  /** Kunden er fysisk til stede (kasse) – kreves av regelverket ved POS. */
  customerPresent?: boolean;
}

export interface CreatePaymentResult {
  /** For QR: URL til QR-bildet (vises på skjermen). For WEB_REDIRECT: redirect. */
  redirectUrl: string;
  reference: string;
  mode: "mock" | "test" | "production";
}

export type VippsPaymentState =
  | "CREATED"
  | "AUTHORIZED"
  | "ABORTED"
  | "EXPIRED"
  | "TERMINATED"
  | "UNKNOWN";

export interface VippsStatus {
  state: VippsPaymentState;
  authorizedOre: number;
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
  const reference = input.reference ?? `booking-${input.bookingId}`;
  const userFlow: VippsUserFlow = input.userFlow ?? "WEB_REDIRECT";

  if (config.vipps.mode === "mock") {
    // Mock: nettbooking (WEB_REDIRECT) går via mock-webhooken som før. Kassa
    // (PUSH_MESSAGE/QR) styres av polling – getPaymentStatus svarer AUTHORIZED
    // i mock, så hele flyten kan testes uten ekte nøkler. QR-bildet er en enkel
    // placeholder slik at skjermbildet ser riktig ut.
    if (userFlow === "WEB_REDIRECT") {
      const url = new URL("/api/vipps/webhook", config.baseUrl);
      url.searchParams.set("mock", "1");
      url.searchParams.set("reference", reference);
      return { redirectUrl: url.toString(), reference, mode: "mock" };
    }
    const qr =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><rect width='220' height='220' fill='#fff'/><text x='110' y='110' font-size='14' text-anchor='middle' fill='#555'>MOCK QR</text><text x='110' y='132' font-size='10' text-anchor='middle' fill='#999'>${reference}</text></svg>`,
      );
    return { redirectUrl: userFlow === "QR" ? qr : "", reference, mode: "mock" };
  }

  const token = await getAccessToken();
  const returnUrl =
    input.returnUrl ??
    (() => {
      const u = new URL("/booking/bekreftelse", config.baseUrl);
      u.searchParams.set("ref", reference);
      return u.toString();
    })();

  const body: Record<string, unknown> = {
    amount: { currency: "NOK", value: input.amountOre },
    paymentMethod: { type: "WALLET" },
    reference,
    returnUrl,
    userFlow,
    paymentDescription: input.description,
  };
  if (input.customerPresent) body.customerInteraction = "CUSTOMER_PRESENT";
  if (input.phoneNumber) body.customer = { phoneNumber: input.phoneNumber };
  if (userFlow === "QR") body.qrFormat = { format: "IMAGE/SVG+XML" };

  const res = await fetch(`${config.vipps.apiBase}/epayment/v1/payments`, {
    method: "POST",
    headers: vippsHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps createPayment failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  // QR-flyten gir en URL til QR-bildet i redirectUrl; WEB_REDIRECT gir redirect.
  return {
    redirectUrl: json.redirectUrl ?? "",
    reference,
    mode: config.vipps.mode,
  };
}

/** Hent betalingsstatus (polling fra kassa). Mock → alltid AUTHORIZED. */
export async function getPaymentStatus(reference: string): Promise<VippsStatus> {
  if (config.vipps.mode === "mock") {
    return { state: "AUTHORIZED", authorizedOre: 0 };
  }
  const token = await getAccessToken();
  const res = await fetch(
    `${config.vipps.apiBase}/epayment/v1/payments/${encodeURIComponent(reference)}`,
    { method: "GET", headers: vippsHeaders(token), cache: "no-store" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vipps getPayment failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    state?: string;
    aggregate?: { authorizedAmount?: { value?: number } };
  };
  const raw = String(json.state ?? "").toUpperCase();
  const known: VippsPaymentState[] = [
    "CREATED",
    "AUTHORIZED",
    "ABORTED",
    "EXPIRED",
    "TERMINATED",
  ];
  const state = (known.includes(raw as VippsPaymentState) ? raw : "UNKNOWN") as VippsPaymentState;
  return {
    state,
    authorizedOre: Number(json.aggregate?.authorizedAmount?.value ?? 0),
  };
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
