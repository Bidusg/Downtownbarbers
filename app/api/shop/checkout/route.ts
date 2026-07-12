/**
 * POST /api/shop/checkout
 * Body: { variantId: string, quantity?: number }
 * Response: { checkoutUrl: string | null, isMock: boolean }
 *
 * Creates a Shopify cart and returns the hosted checkout URL.
 * Mock mode returns null — the product card shows a demo notice instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { createCheckoutUrl } from '@/lib/shopify'

export async function POST(req: NextRequest) {
  let body: { variantId?: string; quantity?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ugyldig forespørsel.' }, { status: 400 })
  }

  if (!body.variantId) {
    return NextResponse.json({ error: 'Mangler variantId.' }, { status: 400 })
  }

  if (!config.shopify.enabled) {
    return NextResponse.json({ checkoutUrl: null, isMock: true })
  }

  try {
    const checkoutUrl = await createCheckoutUrl(body.variantId, body.quantity ?? 1)
    return NextResponse.json({ checkoutUrl, isMock: false })
  } catch (err) {
    console.error('Shopify checkout failed:', err)
    return NextResponse.json(
      { error: 'Kunne ikke åpne kassen. Prøv igjen om litt.' },
      { status: 502 }
    )
  }
}
