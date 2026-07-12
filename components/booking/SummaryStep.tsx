'use client'

import type { Service, Barber } from '@/lib/supabase/types'

const NB_MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
const NB_DAYS_FULL = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']

interface Props {
  service: Service
  barber: Barber | 'any' | null
  date: string
  time: string
  name: string
  email: string
  phone: string
  notes: string
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

export default function SummaryStep({
  service, barber, date, time, name, email, phone, notes, onSubmit, submitting, error,
}: Props) {
  const d = new Date(date + 'T12:00:00')
  const formattedDate = `${NB_DAYS_FULL[d.getDay()]} ${d.getDate()}. ${NB_MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const barberName = barber === 'any' || barber === null ? 'Ingen preferanse' : barber.name

  const row = (label: string, value: string) => (
    <div className="flex items-start justify-between py-3 border-b border-stroke-dark/50 last:border-0">
      <span className="text-muted text-xs font-sans uppercase tracking-[0.22em] shrink-0 mr-4">{label}</span>
      <span className="text-cream text-sm font-sans text-right">{value}</span>
    </div>
  )

  return (
    <div>
      <h2 className="font-display text-xl text-cream mb-1">Bekreft booking</h2>
      <p className="text-muted text-sm font-sans mb-7">Sjekk at alt stemmer før du bekrefter.</p>

      <div className="border border-stroke-dark bg-ink-soft p-4 mb-6">
        {row('Tjeneste', service.name)}
        {row('Barber', barberName)}
        {row('Dato', formattedDate)}
        {row('Tid', time.slice(0, 5))}
        {row('Pris', `${service.price.toLocaleString('nb-NO')} kr`)}
        {row('Varighet', `${service.duration_minutes} min`)}
        <div className="border-t border-stroke-dark pt-3 mt-1 space-y-1">
          {row('Navn', name)}
          {row('E-post', email)}
          {row('Telefon', phone)}
          {notes && row('Merknad', notes)}
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-500/30 bg-red-900/10 px-4 py-3">
          <p className="text-red-400 text-sm font-sans">{error}</p>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={submitting}
        className="w-full py-3.5 bg-forest hover:bg-forest-mid text-cream font-sans text-sm tracking-[0.18em] uppercase transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Sender…' : 'Bekreft time'}
      </button>

      <p className="text-muted text-xs font-sans mt-3 text-center">
        Du vil motta en bekreftelse på e-post etter booking.
      </p>
    </div>
  )
}
