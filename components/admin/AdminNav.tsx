'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/admin', label: 'I dag', exact: true },
  { href: '/admin/bookings', label: 'Alle bookinger', exact: false },
  { href: '/admin/manage', label: 'Barberer & tjenester', exact: false },
]

export default function AdminNav() {
  const path = usePathname()
  const router = useRouter()

  const logout = async () => {
    await createClient().auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <nav className="w-full bg-ink-soft border-b border-stroke-dark px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span className="text-cream font-display text-lg tracking-[0.14em] mr-6">ADMIN</span>
        {links.map(l => {
          const active = l.exact ? path === l.href : path.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 text-xs font-sans tracking-[0.12em] uppercase transition-colors duration-150 ${
                active ? 'text-cream bg-ink-mid' : 'text-muted hover:text-cream'
              }`}
            >
              {l.label}
            </Link>
          )
        })}
      </div>
      <button
        onClick={logout}
        className="text-muted hover:text-cream text-xs font-sans uppercase tracking-[0.12em] transition-colors duration-150"
      >
        Logg ut
      </button>
    </nav>
  )
}
