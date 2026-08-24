'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Service, Barber } from '@/lib/supabase/types'
import Spinner from '@/components/ui/Spinner'

interface Slot { time: string; available: boolean }

interface Props {
  service: Service
  barber: Barber | 'any' | null
  selectedDate: string
  selectedTime: string
  onSelect: (date: string, time: string) => void
}

const NB_DAYS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']
const NB_MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function toISO(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function DateTimeStep({ service, barber, selectedDate, selectedTime, onSelect }: Props) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [calStart, setCalStart] = useState(() => {
    const d = new Date(today)
    d.setDate(1)
    return d
  })
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const barberId = barber === 'any' || barber === null ? 'any' : barber.id

  const fetchSlots = useCallback(
    async (date: string) => {
      setLoadingSlots(true)
      try {
        const params = new URLSearchParams({ date, service_id: service.id, barber_id: barberId })
        const res = await fetch(`/api/availability?${params}`)
        const data = await res.json()
        setSlots(Array.isArray(data) ? data : [])
      } catch {
        setSlots([])
      } finally {
        setLoadingSlots(false)
      }
    },
    [service.id, barberId]
  )

  useEffect(() => {
    if (selectedDate) fetchSlots(selectedDate)
  }, [selectedDate, fetchSlots])

  const daysInMonth = new Date(calStart.getFullYear(), calStart.getMonth() + 1, 0).getDate()
  const firstDow = (calStart.getDay() + 6) % 7 // Mon=0

  const prevMonth = () => setCalStart(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const nextMonth = () => setCalStart(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))

  const handleDay = (day: number) => {
    const d = new Date(calStart.getFullYear(), calStart.getMonth(), day)
    if (d < today) return
    const iso = toISO(d)
    onSelect(iso, '')
    fetchSlots(iso)
  }

  return (
    <div>
      <h2 className="font-display text-xl text-fg mb-1">Velg dato og tid</h2>
      <p className="text-muted text-sm font-sans mb-6">Grønne felt er tilgjengelige.</p>

      {/* Calendar */}
      <div className="mb-6 border border-line bg-surface p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-muted hover:text-fg transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <p className="text-fg text-sm font-sans capitalize">
            {NB_MONTHS[calStart.getMonth()]} {calStart.getFullYear()}
          </p>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-muted hover:text-fg transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {NB_DAYS.map(d => (
            <div key={d} className="text-[9px] tracking-widest text-muted pb-1 font-sans uppercase">{d}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const d = new Date(calStart.getFullYear(), calStart.getMonth(), day)
            const iso = toISO(d)
            const past = d < today
            const isSel = iso === selectedDate
            return (
              <button
                key={day}
                disabled={past}
                onClick={() => handleDay(day)}
                className={`w-8 h-8 mx-auto flex items-center justify-center text-xs font-sans transition-colors duration-150 ${
                  isSel
                    ? 'bg-accent text-accent-fg'
                    : past
                    ? 'text-line cursor-not-allowed'
                    : 'text-fg/70 hover:text-fg hover:bg-surface-2'
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <p className="text-[9px] tracking-[0.28em] text-muted font-sans uppercase mb-3">
            {(() => {
              const d = new Date(selectedDate + 'T12:00:00')
              return `${NB_DAYS[(d.getDay() + 6) % 7].toUpperCase()} ${d.getDate()}. ${NB_MONTHS[d.getMonth()]}`
            })()}
          </p>
          {loadingSlots ? (
            <Spinner />
          ) : slots.length === 0 ? (
            <p className="text-muted text-sm font-sans py-4">Ingen tilgjengelige tider denne dagen.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {slots.map(slot => (
                <button
                  key={slot.time}
                  disabled={!slot.available}
                  onClick={() => slot.available && onSelect(selectedDate, slot.time)}
                  className={`py-2 text-xs font-sans text-center border transition-colors duration-150 ${
                    selectedTime === slot.time
                      ? 'bg-accent border-accent text-accent-fg'
                      : slot.available
                      ? 'border-line hover:border-accent/60 text-fg/80 hover:text-fg bg-surface hover:bg-surface-2'
                      : 'border-line/40 text-line cursor-not-allowed'
                  }`}
                >
                  {slot.time.slice(0, 5)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
