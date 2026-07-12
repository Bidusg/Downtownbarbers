/**
 * Vipps MobilePay ePayment client (server-only).
 *
 * Three modes, selected automatically in config.ts:
 *  - mock:       no credentials. Simulated payment through the REAL code path
 *                (create -> redirect -> confirm), so the flow experienced
 *                today is identical to the flow at go-live.
 *  - test:       apitest.vipps.no with MT (merchant test) credentials.
 *  - production: api.vipps.no.
 *
 * Booking payments only. The web shop deliberately does NOT use this —
 * Shopify handles all shop payments.
 */

import { config } from './config'

export interface CreatePaymentInput {
  /** Booking id from Supabase — used as Vipps reference */
  bookingId: string
  /** Amount in NOK øre (e.g. 45000 = 450 kr) */
  amountOre: number
  /** Shown in the Vipps app */
  description: string
  /** Customer phone, MSISDN format without + (e.g. 4791234567). Optional. */
  phoneNumber?: string
}

export interface CreatePaymentResult {
  /** Where to send the customer next */
  redirectUrl: string
  /** Our payment reference */
  reference: string
  mode: 'mock' | 'test' | 'production'
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token
  }

  const res = await fetch(`${config.vipps.apiBase}/accesstoken/get`, {
    method: 'POST',
    headers: {
      client_id: config.vipps.clientId,
      client_secret: config.vipps.clientSecret,
      'Ocp-Apim-Subscription-Key': config.vipps.subscriptionKey,
      'Merchant-Serial-Number': config.vipps.merchantSerialNumber,
    },
  })
  if (!res.ok) {
    throw new Error(`Vipps auth failed: ${res.status}`)
  }
  const json = await res.json()
  cachedToken = {
    token: json.access_token,
    expiresAt: now + Number(json.expires_in) * 1000,
  }
  return cachedToken.token
}

function vippsHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': config.vipps.subscriptionKey,
    'Merchant-Serial-Number': config.vipps.merchantSerialNumber,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a payment. Returns the URL to redirect the customer to.
 * Mock mode: redirect goes straight to our own confirmation endpoint,
 * which marks the booking paid — same shape, simulated execution.
 */
export async function createPayment(
  input: CreatePaymentInput
): Promise<CreatePaymentResult> {
  const reference = `booking-${input.bookingId}`

  if (config.vipps.mode === 'mock') {
    const url = new URL('/api/vipps/webhook', config.baseUrl)
    url.searchParams.set('mock', '1')
    url.searchParams.set('reference', reference)
    return { redirectUrl: url.toString(), reference, mode: 'mock' }
  }

  const token = await getAccessToken()
  const returnUrl = new URL('/booking/bekreftelse', config.baseUrl)
  returnUrl.searchParams.set('ref', reference)

  const res = await fetch(`${config.vipps.apiBase}/epayment/v1/payments`, {
    method: 'POST',
    headers: vippsHeaders(token),
    body: JSON.stringify({
      amount: { currency: 'NOK', value: input.amountOre },
      paymentMethod: { type: 'WALLET' },
      customer: input.phoneNumber
        ? { phoneNumber: input.phoneNumber }
        : undefined,
      reference,
      returnUrl: returnUrl.toString(),
      userFlow: 'WEB_REDIRECT',
      paymentDescription: input.description,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vipps createPayment failed: ${res.status} ${body}`)
  }
  const json = await res.json()
  return {
    redirectUrl: json.redirectUrl,
    reference,
    mode: config.vipps.mode,
  }
}

export type VippsPaymentState =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'ABORTED'
  | 'EXPIRED'
  | 'TERMINATED'

export async function getPaymentState(
  reference: string
): Promise<VippsPaymentState> {
  if (config.vipps.mode === 'mock') return 'AUTHORIZED'

  const token = await getAccessToken()
  const res = await fetch(
    `${config.vipps.apiBase}/epayment/v1/payments/${encodeURIComponent(reference)}`,
    { headers: vippsHeaders(token) }
  )
  if (!res.ok) {
    throw new Error(`Vipps getPayment failed: ${res.status}`)
  }
  const json = await res.json()
  return json.state as VippsPaymentState
}

/** Capture an authorized payment (full amount). */
export async function capturePayment(
  reference: string,
  amountOre: number
): Promise<void> {
  if (config.vipps.mode === 'mock') return

  const token = await getAccessToken()
  const res = await fetch(
    `${config.vipps.apiBase}/epayment/v1/payments/${encodeURIComponent(reference)}/capture`,
    {
      method: 'POST',
      headers: vippsHeaders(token),
      body: JSON.stringify({
        modificationAmount: { currency: 'NOK', value: amountOre },
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Vipps capture failed: ${res.status} ${body}`)
  }
}
