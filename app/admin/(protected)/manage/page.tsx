'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertService, upsertBarber } from '../../actions'
import type { Service, Barber } from '@/lib/supabase/types'

export default function ManagePage() {
  const [services, setServices] = useState<Service[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [tab, setTab] = useState<'services' | 'barbers'>('services')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  const load = async () => {
    const sb = createClient()
    const [{ data: s }, { data: b }] = await Promise.all([
      sb.from('services').select('*').order('sort_order'),
      sb.from('barbers').select('*').order('name'),
    ])
    setServices(s ?? [])
    setBarbers(b ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleServiceActive = (svc: Service) => {
    startTransition(async () => {
      await upsertService({ ...svc, active: !svc.active })
      load()
    })
  }

  const toggleBarberActive = (barber: Barber) => {
    startTransition(async () => {
      await upsertBarber({ id: barber.id, name: barber.name, role: barber.role, auth_user_id: barber.auth_user_id ?? null, active: !barber.active })
      load()
    })
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="font-display text-2xl text-fg mb-1">Administrasjon</h1>
        <p className="text-muted text-sm font-sans">Administrer barberer og tjenester.</p>
      </div>

      <div className="flex gap-1 mb-7 border-b border-line">
        {(['services', 'barbers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-sans uppercase tracking-[0.16em] border-b-2 -mb-px transition-colors duration-150 ${
              tab === t ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t === 'services' ? 'Tjenester' : 'Barberer'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-muted font-sans text-sm">Laster…</p> : (
        <>
          {tab === 'services' && (
            <div className="border border-line overflow-hidden">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    {['Tjeneste', 'Kategori', 'Pris', 'Varighet', 'Status'].map(h => (
                      <th key={h} className="text-left text-[9px] tracking-[0.22em] text-muted uppercase px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {services.map(svc => (
                    <tr key={svc.id} className="border-b border-line/50 last:border-0 hover:bg-surface-2/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-fg">{svc.name}</p>
                        {svc.description && <p className="text-muted text-xs mt-0.5 line-clamp-1">{svc.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-fg/70">{svc.category}</td>
                      <td className="px-4 py-3 text-fg/80">{svc.price.toLocaleString('nb-NO')} kr</td>
                      <td className="px-4 py-3 text-fg/80">{svc.duration_minutes} min</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleServiceActive(svc)}
                          disabled={isPending}
                          className={`text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 transition-colors cursor-pointer ${
                            svc.active ? 'text-accent-soft bg-accent/10 hover:bg-accent/20' : 'text-muted bg-surface-2 hover:bg-line'
                          }`}
                        >
                          {svc.active ? 'Aktiv' : 'Inaktiv'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'barbers' && (
            <div className="border border-line overflow-hidden">
              <table className="w-full text-sm font-sans">
                <thead>
                  <tr className="border-b border-line bg-surface">
                    {['Navn', 'Rolle', 'Bruker-ID', 'Status'].map(h => (
                      <th key={h} className="text-left text-[9px] tracking-[0.22em] text-muted uppercase px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {barbers.map(b => (
                    <tr key={b.id} className="border-b border-line/50 last:border-0 hover:bg-surface-2/40 transition-colors">
                      <td className="px-4 py-3 text-fg">{b.name}</td>
                      <td className="px-4 py-3 text-fg/70">{b.role}</td>
                      <td className="px-4 py-3 text-muted text-xs font-mono">{b.auth_user_id ?? '–'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleBarberActive(b)}
                          disabled={isPending}
                          className={`text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 transition-colors cursor-pointer ${
                            b.active ? 'text-accent-soft bg-accent/10 hover:bg-accent/20' : 'text-muted bg-surface-2 hover:bg-line'
                          }`}
                        >
                          {b.active ? 'Aktiv' : 'Inaktiv'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
