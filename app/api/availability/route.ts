import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const barber_id = searchParams.get('barber_id')
  const date = searchParams.get('date')
  const service_id = searchParams.get('service_id')

  const exclude_id = searchParams.get('exclude_id') // exclude existing booking from conflict check

  if (!date || !service_id) {
    return NextResponse.json({ error: 'Manglende params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: service } = await supabase
    .from('services')
    .select('duration_minutes')
    .eq('id', service_id)
    .single()

  if (!service) return NextResponse.json({ error: 'Tjeneste ikke funnet' }, { status: 404 })
  const duration = service.duration_minutes

  const dayOfWeek = new Date(date + 'T12:00:00').getDay()

  // If "any", gather all active barbers; otherwise use the specified one
  let barberIds: string[] = []
  if (!barber_id || barber_id === 'any') {
    const { data: allBarbers } = await supabase
      .from('barbers')
      .select('id')
      .eq('active', true)
    barberIds = (allBarbers ?? []).map(b => b.id)
  } else {
    barberIds = [barber_id]
  }

  type Slot = { time: string; available: boolean }
  const mergedAvailability: Record<string, boolean> = {}

  for (const bid of barberIds) {
    const { data: avail } = await supabase
      .from('availability')
      .select('start_time, end_time')
      .eq('barber_id', bid)
      .eq('day_of_week', dayOfWeek)
      .single()

    if (!avail) continue

    let bookingsQuery = supabase
      .from('bookings')
      .select('booking_time, services(duration_minutes)')
      .eq('barber_id', bid)
      .eq('booking_date', date)
      .neq('status', 'cancelled')
    if (exclude_id) bookingsQuery = (bookingsQuery as any).neq('id', exclude_id)
    const { data: bookings } = await bookingsQuery

    const { data: blocked } = await supabase
      .from('blocked_times')
      .select('start_time, end_time, all_day')
      .eq('barber_id', bid)
      .eq('blocked_date', date)

    const isAllDay = (blocked ?? []).some(b => b.all_day)
    if (isAllDay) continue

    const occupied: [number, number][] = [
      ...((bookings ?? []).map(b => {
        const s = toMin(b.booking_time)
        const dur = (b as any).services?.duration_minutes ?? duration
        return [s, s + dur] as [number, number]
      })),
      ...((blocked ?? [])
        .filter(b => b.start_time && b.end_time)
        .map(b => [toMin(b.start_time!), toMin(b.end_time!)] as [number, number])),
    ]

    const start = toMin(avail.start_time)
    const end = toMin(avail.end_time)
    const now = new Date()
    const isToday = date === now.toISOString().split('T')[0]
    const currentMin = now.getHours() * 60 + now.getMinutes()

    for (let m = start; m + duration <= end; m += 30) {
      const slotEnd = m + duration
      const past = isToday && m <= currentMin
      const busy = occupied.some(([os, oe]) => m < oe && slotEnd > os)
      const key = toTime(m)
      if (!past && !busy) {
        mergedAvailability[key] = true
      } else if (!(key in mergedAvailability)) {
        mergedAvailability[key] = false
      }
    }
  }

  const slots: Slot[] = Object.entries(mergedAvailability)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, available]) => ({ time, available }))

  return NextResponse.json(slots)
}
