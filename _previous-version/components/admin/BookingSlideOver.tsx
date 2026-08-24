'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { updateBooking } from '@/app/admin/actions'
import PaymentModal from './PaymentModal'

const BARBER_COLORS: Record<string, string> = {
  Vani: '#3B82F6', Soren: '#10B981', Isak: '#8B5CF6',
  Stavros: '#F59E0B', David: '#EF4444', Mehetabel: '#EC4899',
}
function barberColor(name: string) { return BARBER_COLORS[name] ?? '#6B7280' }

const MONTHS_LONG = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember']
const DAYS_FULL = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag']

function formatDate(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()}. ${MONTHS_LONG[d.getMonth()]}`
}

export interface BookingRow {
  id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  booking_date: string
  booking_time: string
  status: string
  notes: string | null
  services: { id: string; name: string; duration_minutes: number; price: number } | null
  barbers: { id: string; name: string } | null
}

interface SimpleItem { id: string; name: string }
interface ServiceItem { id: string; name: string; price: number; duration_minutes: number }
interface Slot { time: string; available: boolean }

interface Props {
  booking: BookingRow | null
  onClose: () => void
  onUpdated: () => void
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: 'text-accent-soft bg-accent/15',
  completed: 'text-blue-300 bg-blue-900/20',
  cancelled: 'text-red-400 bg-red-900/15',
}
const STATUS_NB: Record<string, string> = {
  confirmed: 'Bekreftet', completed: 'Fullført', cancelled: 'Kansellert',
}

export default function BookingSlideOver({ booking, onClose, onUpdated }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPayment, setShowPayment] = useState(false)

  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editBarberId, setEditBarberId] = useState('')
  const [editServiceId, setEditServiceId] = useState('')
  const [services, setServices] = useState<ServiceItem[]>([])
  const [barbers, setBarbers] = useState<SimpleItem[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Reset mode when booking changes
  useEffect(() => {
    setMode('view')
    setConfirmCancel(false)
    setShowPayment(false)
  }, [booking?.id])

  // Initialise edit state from current booking
  useEffect(() => {
    if (!booking) return
    setEditDate(booking.booking_date)
    setEditTime(booking.booking_time.slice(0, 5))
    setEditBarberId(booking.barbers?.id ?? '')
    setEditServiceId(booking.services?.id ?? '')
  }, [booking])

  // Fetch barbers + services once
  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('services').select('id,name,price,duration_minutes').eq('active', true).order('sort_order'),
      sb.from('barbers').select('id,name').eq('active', true).order('name'),
    ]).then(([{ data: s }, { data: b }]) => {
      setServices((s ?? []) as ServiceItem[])
      setBarbers((b ?? []) as SimpleItem[])
    })
  }, [])

  // Fetch available slots when edit params change
  useEffect(() => {
    if (mode !== 'edit' || !editDate || !editServiceId || !editBarberId || !booking) return
    setLoadingSlots(true)
    const p = new URLSearchParams({ date: editDate, service_id: editServiceId, barber_id: editBarberId, exclude_id: booking.id })
    fetch(`/api/availability?${p}`)
      .then(r => r.json())
      .then(d => setSlots(Array.isArray(d) ? d : []))
      .finally(() => setLoadingSlots(false))
  }, [mode, editDate, editServiceId, editBarberId, booking])

  const handleStatus = async (status: 'confirmed' | 'completed' | 'cancelled') => {
    if (!booking) return
    setSubmitting(true)
    try { await updateBooking(booking.id, { status }); onUpdated() }
    finally { setSubmitting(false); setConfirmCancel(false) }
  }

  const handleSave = async () => {
    if (!booking) return
    setSubmitting(true)
    try {
      await updateBooking(booking.id, {
        booking_date: editDate,
        booking_time: editTime,
        barber_id: editBarberId,
        service_id: editServiceId,
      })
      onUpdated()
      setMode('view')
    } finally { setSubmitting(false) }
  }

  const color = barberColor(booking?.barbers?.name ?? '')

  return (
    <>
    <AnimatePresence>
      {booking && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-canvas/60 backdrop-blur-[2px] z-40"
            onClick={onClose}
          />
          <motion.div
            key="panel"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-surface border-l border-line z-50 flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Color indicator strip */}
            <div className="h-[3px] shrink-0" style={{ backgroundColor: color }} />

            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-line shrink-0">
              <div>
                {mode === 'edit' ? (
                  <button onClick={() => setMode('view')} className="flex items-center gap-2 text-muted hover:text-fg text-xs font-sans uppercase tracking-[0.16em] transition-colors mb-1">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Tilbake
                  </button>
                ) : null}
                <p className="text-fg font-sans font-semibold text-base">{booking.customer_name}</p>
                <p className="text-muted text-xs font-sans mt-0.5">
                  {formatDate(booking.booking_date)} kl {booking.booking_time.slice(0, 5)}
                </p>
              </div>
              <button onClick={onClose} className="text-muted hover:text-fg transition-colors mt-0.5">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {mode === 'view' ? (
                <div className="p-5">
                  {/* Info rows */}
                  <div className="space-y-3 mb-6">
                    {([
                      ['Tjeneste', booking.services?.name ?? '–'],
                      ['Varighet', booking.services ? `${booking.services.duration_minutes} min` : '–'],
                      ['Pris', booking.services ? `${booking.services.price.toLocaleString('nb-NO')} kr` : '–'],
                      ['Barber', booking.barbers?.name ?? '–'],
                      ['Telefon', booking.customer_phone],
                      ['E-post', booking.customer_email],
                      ...(booking.notes ? [['Merknad', booking.notes]] : []),
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <span className="text-[9px] tracking-[0.22em] text-muted font-sans uppercase w-16 shrink-0 pt-0.5">{label}</span>
                        <span className="text-fg text-sm font-sans break-all">{value}</span>
                      </div>
                    ))}
                    <div className="flex gap-3">
                      <span className="text-[9px] tracking-[0.22em] text-muted font-sans uppercase w-16 shrink-0 pt-1">Status</span>
                      <span className={`text-[10px] font-sans uppercase tracking-[0.18em] px-2 py-0.5 ${STATUS_STYLE[booking.status] ?? 'text-muted bg-surface-2'}`}>
                        {STATUS_NB[booking.status] ?? booking.status}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="space-y-2 mb-4">
                    {booking.status !== 'confirmed' && (
                      <button
                        onClick={() => handleStatus('confirmed')}
                        disabled={submitting}
                        className="w-full py-2.5 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-sans uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                      >
                        Bekreft
                      </button>
                    )}
                    {booking.status !== 'completed' && (
                      <button
                        onClick={() => setShowPayment(true)}
                        disabled={submitting}
                        className="w-full py-2.5 bg-blue-900/60 hover:bg-blue-900/80 border border-blue-700/40 text-blue-200 text-xs font-sans uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                      >
                        Fullfør — {booking.services?.price.toLocaleString('nb-NO') ?? '–'} kr
                      </button>
                    )}
                    <button
                      onClick={() => setMode('edit')}
                      className="w-full py-2.5 border border-line hover:border-accent/50 text-fg/70 hover:text-fg text-xs font-sans uppercase tracking-[0.16em] transition-colors"
                    >
                      Rediger
                    </button>
                    <a
                      href={`tel:${booking.customer_phone}`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 border border-line hover:border-accent/40 text-muted hover:text-fg text-xs font-sans uppercase tracking-[0.16em] transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 9c0 .22-.05.43-.15.63a2 2 0 0 1-.4.58c-.23.24-.49.41-.77.51-.28.1-.57.15-.88.15-.46 0-.96-.1-1.48-.33a11.5 11.5 0 0 1-1.48-.87 11.3 11.3 0 0 1-1.4-1.38A11.4 11.4 0 0 1 3.56 6.8c-.22-.52-.33-1.01-.33-1.47 0-.3.05-.6.15-.88.1-.28.27-.54.51-.77.27-.27.57-.4.89-.4.12 0 .24.02.35.07.12.05.22.12.3.23l1.06 1.5c.08.1.14.22.18.32.04.1.07.2.07.29 0 .12-.03.23-.1.34-.06.11-.14.22-.25.33l-.34.35a.23.23 0 0 0-.07.17c0 .03.01.07.03.12.03.04.05.08.07.11.18.32.39.62.64.91.25.28.52.55.81.79.04.02.07.05.12.07.04.02.08.03.12.03a.23.23 0 0 0 .17-.08l.34-.34c.11-.11.22-.2.33-.25.11-.06.22-.08.35-.08.09 0 .2.02.3.07.11.05.22.11.33.19l1.52 1.08c.11.08.18.17.23.28.04.11.06.23.06.36Z" stroke="currentColor" strokeWidth="1"/></svg>
                      Ring {booking.customer_name.split(' ')[0]}
                    </a>
                  </div>

                  {/* Cancel section */}
                  {booking.status !== 'cancelled' && !confirmCancel && (
                    <button
                      onClick={() => setConfirmCancel(true)}
                      className="w-full py-2 text-red-400/70 hover:text-red-400 text-xs font-sans uppercase tracking-[0.16em] transition-colors border border-transparent hover:border-red-500/30"
                    >
                      Avbestill time
                    </button>
                  )}
                  {confirmCancel && (
                    <div className="border border-red-500/30 bg-red-900/10 p-4">
                      <p className="text-danger text-sm font-sans mb-3">
                        Er du sikker på at du vil avbestille denne timen?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatus('cancelled')}
                          disabled={submitting}
                          className="flex-1 py-2 bg-red-900/50 hover:bg-red-900/70 border border-red-500/40 text-red-200 text-xs font-sans uppercase tracking-[0.14em] transition-colors disabled:opacity-50"
                        >
                          Ja, avbestill
                        </button>
                        <button
                          onClick={() => setConfirmCancel(false)}
                          className="flex-1 py-2 border border-line text-muted hover:text-fg text-xs font-sans uppercase tracking-[0.14em] transition-colors"
                        >
                          Nei
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Edit mode */
                <div className="p-5">
                  <p className="text-[9px] tracking-[0.28em] text-muted font-sans uppercase mb-4">Rediger time</p>

                  <div className="space-y-4 mb-6">
                    {/* Service */}
                    <div>
                      <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">Tjeneste</label>
                      <select
                        value={editServiceId}
                        onChange={e => { setEditServiceId(e.target.value); setEditTime('') }}
                        className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg outline-none focus:border-accent transition-colors"
                      >
                        {services.map(s => <option key={s.id} value={s.id}>{s.name} — {s.price.toLocaleString('nb-NO')} kr</option>)}
                      </select>
                    </div>

                    {/* Barber */}
                    <div>
                      <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">Barber</label>
                      <select
                        value={editBarberId}
                        onChange={e => { setEditBarberId(e.target.value); setEditTime('') }}
                        className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg outline-none focus:border-accent transition-colors"
                      >
                        {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">Dato</label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={e => { setEditDate(e.target.value); setEditTime('') }}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg outline-none focus:border-accent transition-colors"
                      />
                    </div>

                    {/* Time */}
                    <div>
                      <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">Tid</label>
                      {loadingSlots ? (
                        <p className="text-muted text-xs font-sans py-2">Laster tider…</p>
                      ) : slots.length === 0 ? (
                        <p className="text-muted text-xs font-sans py-2">Ingen tilgjengelige tider.</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5">
                          {slots.map(slot => (
                            <button
                              key={slot.time}
                              disabled={!slot.available}
                              onClick={() => slot.available && setEditTime(slot.time)}
                              className={`py-1.5 text-xs font-sans border transition-colors ${
                                editTime === slot.time
                                  ? 'bg-accent border-accent text-accent-fg'
                                  : slot.available
                                  ? 'border-line text-fg/70 hover:border-accent/50 hover:text-fg bg-canvas'
                                  : 'border-line/30 text-muted/30 cursor-not-allowed'
                              }`}
                            >
                              {slot.time.slice(0, 5)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={submitting || !editDate || !editTime || !editBarberId || !editServiceId}
                    className="w-full py-3 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-sans uppercase tracking-[0.18em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Lagrer…' : 'Lagre endringer'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* Payment modal — sits above the slide-over */}
      <AnimatePresence>
        {showPayment && booking && (
          <PaymentModal
            booking={booking}
            onClose={() => setShowPayment(false)}
            onCompleted={() => { setShowPayment(false); onUpdated() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
