export type Service = {
  id: string
  name: string
  description: string | null
  price: number
  duration_minutes: number
  category: 'hair' | 'beard' | 'facial'
  active: boolean
  sort_order: number
}

export type Barber = {
  id: string
  name: string
  role: string
  bio: string | null
  active: boolean
  auth_user_id: string | null
}

export type Availability = {
  id: string
  barber_id: string
  day_of_week: number
  start_time: string
  end_time: string
}

export type Booking = {
  id: string
  service_id: string | null
  barber_id: string | null
  customer_name: string
  customer_email: string
  customer_phone: string
  booking_date: string
  booking_time: string
  status: 'confirmed' | 'cancelled' | 'completed'
  notes: string | null
  created_at: string
  services?: Pick<Service, 'id' | 'name' | 'price' | 'duration_minutes'>
  barbers?: Pick<Barber, 'id' | 'name' | 'role'>
}

export type BlockedTime = {
  id: string
  barber_id: string
  blocked_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
  all_day: boolean
}
