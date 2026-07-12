'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import StepIndicator from '@/components/ui/StepIndicator'
import ServiceStep from './ServiceStep'
import BarberStep from './BarberStep'
import DateTimeStep from './DateTimeStep'
import ContactStep from './ContactStep'
import SummaryStep from './SummaryStep'
import type { Service, Barber } from '@/lib/supabase/types'

const STEPS = ['Tjeneste', 'Barber', 'Dato & Tid', 'Kontakt', 'Bekreft']

interface ContactData {
  name: string
  email: string
  phone: string
  notes: string
}

type ContactErrors = Partial<ContactData>

export default function BookingWizard() {
  const [step, setStep] = useState(1)
  const [service, setService] = useState<Service | null>(null)
  const [barber, setBarber] = useState<Barber | 'any' | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [contact, setContact] = useState<ContactData>({ name: '', email: '', phone: '', notes: '' })
  const [contactErrors, setContactErrors] = useState<ContactErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)

  const dir = 1

  const validateContact = (): boolean => {
    const errs: ContactErrors = {}
    if (!contact.name.trim()) errs.name = 'Navn er påkrevd'
    if (!contact.email.trim()) errs.email = 'E-post er påkrevd'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) errs.email = 'Ugyldig e-post'
    if (!contact.phone.trim()) errs.phone = 'Telefon er påkrevd'
    setContactErrors(errs)
    return Object.keys(errs).length === 0
  }

  const next = () => {
    if (step === 1 && !service) return
    if (step === 3 && (!date || !time)) return
    if (step === 4 && !validateContact()) return
    setStep(s => Math.min(s + 1, 5))
  }

  const prev = () => setStep(s => Math.max(s - 1, 1))

  const handleDateTimeSelect = (d: string, t: string) => { setDate(d); setTime(t) }

  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: service!.id,
          barber_id: barber === 'any' || barber === null ? null : barber.id,
          date, time,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          notes: contact.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSubmitError(data.error ?? 'Noe gikk galt.'); return }
      setBookingId(data.id)
    } catch {
      setSubmitError('Nettverksfeil. Prøv igjen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (bookingId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center py-12 px-4"
      >
        <div className="w-14 h-14 bg-forest/20 border border-forest mx-auto flex items-center justify-center mb-6">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5L9.5 17L19 7" stroke="#3D8A69" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="font-display text-2xl text-cream mb-3">Time bekreftet</h2>
        <p className="text-muted font-sans text-sm leading-relaxed max-w-sm mx-auto mb-2">
          Takk, {contact.name}. En bekreftelse er sendt til {contact.email}.
        </p>
        <p className="text-muted font-sans text-xs">
          {date} kl {time.slice(0, 5)} · {service?.name}
        </p>
        <a
          href="/"
          className="inline-block mt-8 px-6 py-2.5 border border-stroke-dark text-cream/70 text-xs font-sans tracking-[0.16em] uppercase hover:border-forest/50 hover:text-cream transition-colors duration-200"
        >
          Tilbake til forsiden
        </a>
      </motion.div>
    )
  }

  const canNext =
    (step === 1 && !!service) ||
    (step === 2) ||
    (step === 3 && !!date && !!time) ||
    (step === 4) ||
    step === 5

  const variants = {
    enter: { opacity: 0, x: 32 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -32 },
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-10">
        <StepIndicator steps={STEPS} current={step} />
      </div>

      <div className="min-h-[420px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 1 && (
              <ServiceStep selected={service} onSelect={s => { setService(s); setTime('') }} />
            )}
            {step === 2 && (
              <BarberStep selected={barber} onSelect={b => { setBarber(b); setTime('') }} />
            )}
            {step === 3 && service && (
              <DateTimeStep
                service={service}
                barber={barber}
                selectedDate={date}
                selectedTime={time}
                onSelect={handleDateTimeSelect}
              />
            )}
            {step === 4 && (
              <ContactStep data={contact} onChange={setContact} errors={contactErrors} />
            )}
            {step === 5 && service && (
              <SummaryStep
                service={service}
                barber={barber}
                date={date}
                time={time}
                name={contact.name}
                email={contact.email}
                phone={contact.phone}
                notes={contact.notes}
                onSubmit={handleSubmit}
                submitting={submitting}
                error={submitError}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {step < 5 && (
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-stroke-dark">
          {step > 1 ? (
            <button
              onClick={prev}
              className="flex items-center gap-2 text-muted hover:text-cream text-xs font-sans uppercase tracking-[0.18em] transition-colors duration-150"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Tilbake
            </button>
          ) : <div />}

          <button
            onClick={next}
            disabled={!canNext}
            className="flex items-center gap-2 px-5 py-2.5 bg-forest hover:bg-forest-mid text-cream text-xs font-sans uppercase tracking-[0.18em] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 4 ? 'Gå til bekreftelse' : 'Neste'}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
