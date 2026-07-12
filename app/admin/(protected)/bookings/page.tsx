'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateBookingStatus } from '../../actions'

const STATUS_OPTIONS = ['confirmed', 'completed', 'cancelled'] as const
type Status = typeof STATUS_OPTIONS[number]
const STATUS_LABELS: Record<Status, string> = { confirmed: 'Bekreftet', completed: 'Fullført', cancelled: 'Kansellert' }
const STATUS_COLORS: Record<Status, string> = {
  confirmed: 'text-forest-light bg-forest/10',
  completed: 'text-muted bg-ink-mid',
  cancelled: 'text-red-400 bg-red-900/10',
}

const NB_MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']

export default function AllBookings() {
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState('')
  const [filterBarber, setFilterBarber] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([])
  const [isPending, startTransition] = useTransition()

  const load = async () => {
    setLoading(true)
    const supabase = createClient()
    let q = supabase
      .from('bookings')
      .select('*, services(name), barbers(name, id)')
      .order('booking_date', { ascending: false })
      .order('booking_time')
    if (filterDate) q = q.eq('booking_date', filterDate)
    if (filterBarber) q = q.eq('barber_id', filterBarber)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setBookings(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    createClient().from('barbers').select('id,name').eq('active', true).then(({ data }) => setBarbers(data ?? []))
    load()
  }, [])

  useEffect(() => { load() }, [filterDate, filterBarber, filterStatus])

  const handleStatus = (id: string, status: Status) => {
    startTransition(async () => {
      await updateBookingStatus(id, status)
      load()
    })
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return `${d.getDate()}. ${NB_MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-display text-2xl text-cream mb-1">Alle bookinger</h1>
        <p className="text-muted text-sm font-sans">Filtrer og administrer alle timer.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="bg-ink-soft border border-stroke-dark px-3 py-2 text-sm font-sans text-cream outline-none focus:border-forest transition-colors"
        />
        <select
          value={filterBarber}
          onChange={e => setFilterBarber(e.target.value)}
          className="bg-ink-soft border border-stroke-dark px-3 py-2 text-sm font-sans text-cream outline-none focus:border-forest transition-colors"
        >
          <option value="">Alle barberer</option>
          {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-ink-soft border border-stroke-dark px-3 py-2 text-sm font-sans text-cream outline-none focus:border-forest transition-colors"
        >
          <option value="">Alle statuser</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        {(filterDate || filterBarber || filterStatus) && (
          <button
            onClick={() => { setFilterDate(''); setFilterBarber(''); setFilterStatus('') }}
            className="text-muted hover:text-cream text-xs font-sans uppercase tracking-[0.14em] transition-colors"
          >
            Nullstill
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted font-sans text-sm">Laster…</p>
      ) : bookings.length === 0 ? (
        <p className="text-muted font-sans text-sm">Ingen bookinger funnet.</p>
      ) : (
        <div className="border border-stroke-dark overflow-x-auto">
          <table className="w-full text-sm font-sans min-w-[640px]">
            <thead>
              <tr className="border-b border-stroke-dark bg-ink-soft">
                {['Dato', 'Tid', 'Kunde', 'Tjeneste', 'Barber', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-[9px] tracking-[0.22em] text-muted uppercase px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} className="border-b border-stroke-dark/50 last:border-0 hover:bg-ink-mid/40 transition-colors">
                  <td className="px-4 py-3 text-cream/80 whitespace-nowrap">{fmtDate(b.booking_date)}</td>
                  <td className="px-4 py-3 text-cream">{String(b.booking_time).slice(0, 5)}</td>
                  <td className="px-4 py-3">
                    <p className="text-cream">{b.customer_name}</p>
                    <p className="text-muted text-xs">{b.customer_email}</p>
                  </td>
                  <td className="px-4 py-3 text-cream/80">{b.services?.name}</td>
                  <td className="px-4 py-3 text-cream/80">{b.barbers?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 ${STATUS_COLORS[b.status as Status] ?? 'text-muted'}`}>
                      {STATUS_LABELS[b.status as Status] ?? b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={b.status}
                      disabled={isPending}
                      onChange={e => handleStatus(b.id, e.target.value as Status)}
                      className="bg-ink border border-stroke-dark px-2 py-1 text-xs font-sans text-cream outline-none focus:border-forest transition-colors"
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
