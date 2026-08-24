'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Barber } from '@/lib/supabase/types'
import Spinner from '@/components/ui/Spinner'

interface Props {
  selected: Barber | null | 'any'
  onSelect: (barber: Barber | 'any') => void
}

export default function BarberStep({ selected, onSelect }: Props) {
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('barbers')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(({ data }) => { setBarbers(data ?? []); setLoading(false) })
  }, [])

  if (loading) return <Spinner />

  const items = [{ id: 'any', name: 'Ingen preferanse', role: 'Tilgjengelig barber tildeles automatisk' } as const, ...barbers]

  return (
    <div>
      <h2 className="font-display text-xl text-fg mb-1">Velg barber</h2>
      <p className="text-muted text-sm font-sans mb-7">Valgfritt – vi matcher deg med beste tilgjengelige.</p>

      <div className="space-y-2">
        {items.map(item => {
          const isAny = item.id === 'any'
          const active = isAny ? selected === 'any' : (selected as Barber)?.id === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSelect(isAny ? 'any' : (item as Barber))}
              className={`w-full text-left p-4 border transition-colors duration-150 flex items-center gap-4 group ${
                active
                  ? 'border-accent bg-accent/10'
                  : 'border-line hover:border-accent/50 bg-surface hover:bg-surface-2'
              }`}
            >
              <div className={`w-10 h-10 flex items-center justify-center shrink-0 font-display text-base ${
                active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted group-hover:bg-line'
              }`}>
                {isAny ? '✦' : item.name.charAt(0)}
              </div>
              <div>
                <p className={`font-sans text-sm font-medium transition-colors ${active ? 'text-fg' : 'text-fg/80 group-hover:text-fg'}`}>
                  {item.name}
                </p>
                <p className="text-muted text-xs mt-0.5 font-sans">{item.role}</p>
              </div>
              {active && (
                <div className="ml-auto w-4 h-4 flex items-center justify-center text-accent">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 5.5L3.5 8L9 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
