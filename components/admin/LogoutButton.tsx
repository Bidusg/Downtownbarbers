'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const handleLogout = async () => {
    await createClient().auth.signOut()
    router.push(redirectTo)
    router.refresh()
  }
  return (
    <button
      onClick={handleLogout}
      className="text-muted hover:text-cream text-xs font-sans uppercase tracking-[0.12em] transition-colors duration-150"
    >
      Logg ut
    </button>
  )
}
