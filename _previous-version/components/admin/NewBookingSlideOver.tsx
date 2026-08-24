'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { createAdminBooking } from '@/app/admin/actions'

interface ServiceItem { id: string; name: string; price: number; duration_minutes: number }
interface BarberItem { id: string; name: string }
interface Slot { time: string; available: boolean }

interface Props {
  open: boolean
  defaultDate?: string
  defaultBarberId?: string
  onClose: () => void
  onCreated: () => void
}

export default function NewBookingSlideOver({ open, defaultDate, defaultBarberId, onClose, onCreated }: Props) {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [barbers, setBarbers] = useState<BarberItem[]>([])
  const [serviceId, setServiceId] = useState('')
  const [barberId, setBarberId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('services').select('id,name,price,duration_minutes').eq('active', true).order('sort_order'),
      sb.from('barbers').select('id,name').eq('active', true).order('name'),
    ]).then(([{ data: s }, { data: b }]) => {
      const svcs = (s ?? []) as ServiceItem[]
      const brbs = (b ?? []) as BarberItem[]
      setServices(svcs)
      setBarbers(brbs)
      if (svcs.length) setServiceId(svcs[0].id)
    })
  }, [])

  // Sync defaults when panel opens
  useEffect(() => {
    if (!open) return
    setDate(defaultDate ?? new Date().toISOString().split('T')[0])
    setBarberId(defaultBarberId ?? '')
    setTime('')
    setName('')
    setEmail('')
    setPhone('')
    setNotes('')
    setError('')
  }, [open, defaultDate, defaultBarberId])

  // Fetch slots
  useEffect(() => {
    if (!open || !date || !serviceId || !barberId) { setSlots([]); return }
    setLoadingSlots(true)
    setTime('')
    const p = new URLSearchParams({ date, service_id: serviceId, barber_id: barberId })
    fetch(`/api/availability?${p}`)
      .then(r => r.json())
      .then(d => setSlots(Array.isArray(d) ? d : []))
      .finally(() => setLoadingSlots(false))
  }, [open, date, serviceId, barberId])

  const handleSubmit = async () => {
    if (!serviceId || !barberId || !date || !time || !name || !phone) {
      setError('Fyll ut alle obligatoriske felt.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await createAdminBooking({ service_id: serviceId, barber_id: barberId, booking_date: date, booking_time: time, customer_name: name, customer_email: email, customer_phone: phone, notes })
      onCreated()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Noe gikk galt.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
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
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-surface border-l border-line z-50 flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Forest top strip */}
            <div className="h-[3px] bg-accent shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
              <p className="text-fg font-sans font-semibold text-base">Ny time</p>
              <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                {/* Service */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">
                    Tjeneste <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={serviceId}
                    onChange={e => setServiceId(e.target.value)}
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg outline-none focus:border-accent transition-colors"
                  >
                    <option value="">Velg tjeneste…</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.price.toLocaleString('nb-NO')} kr ({s.duration_minutes} min)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Barber */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">
                    Barber <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={barberId}
                    onChange={e => setBarberId(e.target.value)}
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg outline-none focus:border-accent transition-colors"
                  >
                    <option value="">Velg barber…</option>
                    {barbers.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">
                    Dato <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Time grid */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">
                    Tid <span className="text-red-400">*</span>
                  </label>
                  {!serviceId || !barberId || !date ? (
                    <p className="text-muted/50 text-xs font-sans py-1">Velg tjeneste, barber og dato først.</p>
                  ) : loadingSlots ? (
                    <p className="text-muted text-xs font-sans py-2">Laster tider…</p>
                  ) : slots.length === 0 ? (
                    <p className="text-muted text-xs font-sans py-2">Ingen tilgjengelige tider på valgt dato.</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {slots.map(slot => (
                        <button
                          key={slot.time}
                          disabled={!slot.available}
                          onClick={() => slot.available && setTime(slot.time)}
                          className={`py-1.5 text-xs font-sans border transition-colors ${
                            time === slot.time
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

                {/* Divider */}
                <div className="border-t border-line pt-2">
                  <p className="text-[9px] tracking-[0.28em] text-muted font-sans uppercase">Kundeinfo</p>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">
                    Navn <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Fullt navn"
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg placeholder:text-muted/40 outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">
                    Telefon <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+47 XXX XX XXX"
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg placeholder:text-muted/40 outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">E-post</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="kunde@epost.no"
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg placeholder:text-muted/40 outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[9px] tracking-[0.22em] text-muted font-sans uppercase mb-1.5">Merknad</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Valgfritt…"
                    className="w-full bg-canvas border border-line px-3 py-2 text-sm font-sans text-fg placeholder:text-muted/40 outline-none focus:border-accent transition-colors resize-none"
                  />
                </div>
              </div>

              {error && (
                <p className="mt-4 text-red-400 text-xs font-sans border border-red-500/30 bg-red-900/10 px-3 py-2">{error}</p>
              )}
            </div>

            {/* Footer CTA */}
            <div className="border-t border-line p-5 shrink-0">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-sans uppercase tracking-[0.18em] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Oppretter…' : 'Opprett time'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
