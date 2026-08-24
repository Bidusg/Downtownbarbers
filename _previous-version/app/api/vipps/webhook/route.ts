/**
 * Vipps callback handling.
 *
 * GET  /api/vipps/webhook?mock=1&reference=... — mock-mode "payment": marks
 *      the booking paid and redirects to the confirmation page. Only active
 *      when Vipps mode is mock; returns 404 otherwise so it cannot be abused
 *      in production.
 *
 * POST /api/vipps/webhook — real Vipps webhook (test/production). Register
 *      this URL in the Vipps portal at go-live. On AUTHORIZED: capture and
 *      mark the booking paid in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { createAdminClient } from '@/lib/supabase/server'
import { capturePayment, getPaymentState } from '@/lib/vipps'

async function markBookingPaid(reference: string): Promise<void> {
  const bookingId = reference.replace(/^booking-/, '')
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bookings')
    .update({
      payment_provider: 'vipps',
      payment_status: 'paid',
      vipps_reference: reference,
      // Same end result as the pre-integration admin flow:
      status: 'completed',
      payment_method: 'vipps',
      paid_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
  if (error) {
    throw new Error(`Failed to mark booking ${bookingId} paid: ${error.message}`)
  }
}

export async function GET(req: NextRequest) {
  const isMockRequest = req.nextUrl.searchParams.get('mock') === '1'
  const reference = req.nextUrl.searchParams.get('reference')

  if (!isMockRequest || config.vipps.mode !== 'mock' || !reference) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await markBookingPaid(reference)
  } catch (err) {
    console.error('[vipps mock]', err)
    return NextResponse.json(
      { error: 'Kunne ikke registrere betalingen.' },
      { status: 500 }
    )
  }

  const confirmation = new URL('/booking/bekreftelse', config.baseUrl)
  confirmation.searchParams.set('ref', reference)
  confirmation.searchParams.set('demo', '1')
  return NextResponse.redirect(confirmation)
}

export async function POST(req: NextRequest) {
  if (config.vipps.mode === 'mock') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // TODO (go-live): verify the webhook signature per Vipps' webhook
  // documentation — the secret is issued when the webhook is registered
  // in the Vipps portal.

  let payload: { reference?: string; name?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const reference = payload.reference
  if (!reference) {
    return NextResponse.json({ error: 'Missing reference' }, { status: 400 })
  }

  // Re-check state server-side rather than trusting the event blindly.
  const state = await getPaymentState(reference)

  if (state === 'AUTHORIZED') {
    // Amount comes from the booking's service price in the database —
    // never from the webhook payload.
    const bookingId = reference.replace(/^booking-/, '')
    const supabase = createAdminClient()
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, services(price)')
      .eq('id', bookingId)
      .single()

    const price = (booking?.services as unknown as { price: number } | null)?.price
    if (!booking || !price) {
      console.error(`[vipps webhook] booking ${bookingId} not found or has no price`)
      return NextResponse.json({ error: 'Unknown booking' }, { status: 404 })
    }

    await capturePayment(reference, price * 100)
    await markBookingPaid(reference)
  }

  return NextResponse.json({ ok: true })
}
