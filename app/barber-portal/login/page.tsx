'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function BarberLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Feil e-post eller passord.')
    } else {
      router.push('/barber-portal')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-[9px] tracking-[0.42em] text-muted font-sans mb-2 uppercase">Downtown Barbers</p>
        <h1 className="font-display text-2xl text-fg mb-8">Barber-portal</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] tracking-[0.28em] text-muted font-sans uppercase mb-1.5">E-post</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-surface border border-line px-3 py-2.5 text-sm font-sans text-fg placeholder:text-muted/40 outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-[9px] tracking-[0.28em] text-muted font-sans uppercase mb-1.5">Passord</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-surface border border-line px-3 py-2.5 text-sm font-sans text-fg placeholder:text-muted/40 outline-none focus:border-accent transition-colors"
            />
          </div>
          {error && <p className="text-red-400 text-sm font-sans">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-accent-fg font-sans text-sm tracking-[0.18em] uppercase transition-colors duration-200 disabled:opacity-50"
          >
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>
      </div>
    </main>
  )
}
