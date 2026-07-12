'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import WeekCalendar from '@/components/admin/WeekCalendar'

export default function BarberPortal() {
  const [barberId, setBarberId] = useState<string | null>(null)
  const [barberName, setBarberName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: b } = await sb
        .from('barbers')
        .select('id, name')
        .eq('auth_user_id', user.id)
        .single()
      if (b) { setBarberId(b.id); setBarberName(b.name) }
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return (
    <div className="py-16 text-center text-muted font-sans text-sm">Laster…</div>
  )

  if (!barberId) return (
    <div className="py-16 text-center text-muted font-sans text-sm">Barber ikke funnet for denne brukeren.</div>
  )

  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-xs font-sans uppercase tracking-[0.22em] mb-1">Mine timer</p>
        <h1 className="font-display text-2xl text-fg">{barberName}</h1>
      </div>
      <WeekCalendar barberId={barberId} />
    </div>
  )
}
