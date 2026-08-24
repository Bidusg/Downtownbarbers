'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateBookingStatus(
  id: string,
  status: 'confirmed' | 'cancelled' | 'completed'
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
}

export async function upsertService(data: {
  id?: string
  name: string
  description: string | null
  price: number
  duration_minutes: number
  category: string
  active: boolean
  sort_order: number
}) {
  const supabase = createAdminClient()
  if (data.id) {
    const { error } = await supabase
      .from('services')
      .update({ ...data })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
  } else {
    const { id: _, ...insertData } = data
    const { error } = await supabase.from('services').insert(insertData)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/manage')
}

export async function deleteService(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/manage')
}

export async function upsertBarber(data: {
  id?: string
  name: string
  role: string
  auth_user_id: string | null
  active: boolean
}) {
  const supabase = createAdminClient()
  if (data.id) {
    const { error } = await supabase.from('barbers').update({ ...data }).eq('id', data.id)
    if (error) throw new Error(error.message)
  } else {
    const { id: _, ...insertData } = data
    const { error } = await supabase.from('barbers').insert(insertData)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/manage')
}

export async function deleteBarber(id: string) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('barbers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/manage')
}

export async function updateBooking(
  id: string,
  data: {
    status?: 'confirmed' | 'cancelled' | 'completed'
    booking_date?: string
    booking_time?: string
    barber_id?: string
    service_id?: string
  }
) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('bookings').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/admin/bookings')
}

export async function completeBookingWithPayment(
  id: string,
  payment_method: 'vipps' | 'cash'
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      payment_method,
      paid_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  // No revalidatePath — the Supabase realtime subscription in WeekCalendar
  // updates the calendar automatically when the booking row changes.
}

export async function createAdminBooking(data: {
  service_id: string
  barber_id: string
  booking_date: string
  booking_time: string
  customer_name: string
  customer_email: string
  customer_phone: string
  notes: string
}) {
  const supabase = createAdminClient()
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({ ...data, status: 'confirmed' })
    .select('id, booking_date, booking_time, services(name), barbers(name)')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  return booking as unknown as {
    id: string
    booking_date: string
    booking_time: string
    services: { name: string } | null
    barbers: { name: string } | null
  }
}
