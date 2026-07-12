'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Service } from '@/lib/supabase/types'
import Spinner from '@/components/ui/Spinner'

interface Props {
  selected: Service | null
  onSelect: (service: Service) => void
}

export default function ServiceStep({ selected, onSelect }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('services')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => { setServices(data ?? []); setLoading(false) })
  }, [])

  if (loading) return <Spinner />

  const categories = Array.from(new Set(services.map(s => s.category)))

  return (
    <div>
      <h2 className="font-display text-xl text-fg mb-1">Velg tjeneste</h2>
      <p className="text-muted text-sm font-sans mb-7">Hva kan vi gjøre for deg i dag?</p>

      {categories.map(cat => (
        <div key={cat} className="mb-7">
          <p className="text-[9px] tracking-[0.34em] text-muted font-sans mb-3 uppercase">{cat}</p>
          <div className="space-y-2">
            {services.filter(s => s.category === cat).map(service => {
              const active = selected?.id === service.id
              return (
                <button
                  key={service.id}
                  onClick={() => onSelect(service)}
                  className={`w-full text-left p-4 border transition-colors duration-150 flex items-center justify-between group ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-line hover:border-accent/50 bg-surface hover:bg-surface-2'
                  }`}
                >
                  <div>
                    <p className={`font-sans text-sm font-medium transition-colors ${active ? 'text-fg' : 'text-fg/80 group-hover:text-fg'}`}>
                      {service.name}
                    </p>
                    {service.description && (
                      <p className="text-muted text-xs mt-0.5 font-sans leading-relaxed">{service.description}</p>
                    )}
                    <p className="text-muted text-xs mt-1.5 font-sans">{service.duration_minutes} min</p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className={`font-sans text-base font-medium transition-colors ${active ? 'text-accent-soft' : 'text-fg/60 group-hover:text-fg/80'}`}>
                      {service.price % 1 === 0
                        ? `${service.price.toLocaleString('nb-NO')} kr`
                        : `fra ${Math.floor(service.price).toLocaleString('nb-NO')} kr`}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
