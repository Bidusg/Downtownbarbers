/**
 * POST /api/vipps/create
 * Body: { bookingId: string, phoneNumber?: string }
 * Response: { redirectUrl: string, reference: string, mode: string }
 *
 * The admin payment modal calls this endpoint and acts on `redirectUrl`.
 * Amount and description are resolved server-side from the booking's
 * service in Supabase — the client-supplied amount is never trusted.
 * Works identically in mock, test and production — only the destination
 * changes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createPayment } from '@/lib/vipps'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ugyldig forespørsel.' }, { status: 400 })
  }

  const { bookingId, phoneNumber } = (body ?? {}) as {
    bookingId?: string
    phoneNumber?: string
  }

  if (!bookingId) {
    return NextResponse.json({ error: 'Mangler bookingId.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, status, services(name, price)')
    .eq('id', bookingId)
    .single()

  if (error || !booking) {
    return NextResponse.json({ error: 'Fant ikke bookingen.' }, { status: 404 })
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Bookingen er kansellert og kan ikke betales.' },
      { status: 409 }
    )
  }

  const service = booking.services as unknown as {
    name: string
    price: number
  } | null
  if (!service?.price) {
    return NextResponse.json(
      { error: 'Bookingen mangler pris — kan ikke starte betaling.' },
      { status: 422 }
    )
  }

  try {
    const result = await createPayment({
      bookingId,
      amountOre: service.price * 100,
      description: `${service.name} — Downtown Barbers`,
      phoneNumber,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('Vipps create failed:', err)
    return NextResponse.json(
      { error: 'Kunne ikke starte betaling. Prøv igjen, eller velg betaling i kassen.' },
      { status: 502 }
    )
  }
}
