import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { config } from '@/lib/config'

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { service_id, barber_id, date, time, name, email, phone, notes } = body

  if (!service_id || !date || !time || !name || !email || !phone) {
    return NextResponse.json({ error: 'Manglende felt' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Resolve barber: if null/any, pick the least-busy available one
  let resolvedBarberId: string | null = barber_id || null

  if (!resolvedBarberId) {
    const { data: service } = await supabase
      .from('services')
      .select('duration_minutes')
      .eq('id', service_id)
      .single()
    const duration = service?.duration_minutes ?? 30
    const slotEnd = toMin(time) + duration
    const dayOfWeek = new Date(date + 'T12:00:00').getDay()

    const { data: allBarbers } = await supabase
      .from('barbers')
      .select('id')
      .eq('active', true)

    for (const b of allBarbers ?? []) {
      const { data: avail } = await supabase
        .from('availability')
        .select('start_time, end_time')
        .eq('barber_id', b.id)
        .eq('day_of_week', dayOfWeek)
        .single()
      if (!avail) continue
      if (toMin(time) < toMin(avail.start_time) || slotEnd > toMin(avail.end_time)) continue

      const { data: conflict } = await supabase
        .from('bookings')
        .select('id')
        .eq('barber_id', b.id)
        .eq('booking_date', date)
        .eq('booking_time', time)
        .neq('status', 'cancelled')
        .maybeSingle()
      if (!conflict) { resolvedBarberId = b.id; break }
    }

    if (!resolvedBarberId) {
      return NextResponse.json({ error: 'Ingen barberer tilgjengelig på denne timen.' }, { status: 409 })
    }
  }

  // Double-check slot is free
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('barber_id', resolvedBarberId)
    .eq('booking_date', date)
    .eq('booking_time', time)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Timen er allerede opptatt. Velg en annen tid.' }, { status: 409 })
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      service_id,
      barber_id: resolvedBarberId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      booking_date: date,
      booking_time: time,
      notes: notes || null,
      status: 'confirmed',
    })
    .select('id, booking_date, booking_time, services(name), barbers(name)')
    .single()

  if (error || !booking) {
    console.error('[bookings POST]', error)
    return NextResponse.json({ error: 'Kunne ikke opprette booking' }, { status: 500 })
  }

  // Fire confirmation email (non-blocking)
  const bDate = new Date(booking.booking_date + 'T12:00:00')
  const formattedDate = bDate.toLocaleDateString('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  fetch(`${config.baseUrl}/api/booking-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, email,
      date: formattedDate,
      time: booking.booking_time.slice(0, 5),
      barber: (booking as any).barbers?.name ?? '',
      service: (booking as any).services?.name ?? '',
    }),
  }).catch(e => console.error('[email]', e))

  return NextResponse.json({ id: booking.id })
}
