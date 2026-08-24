import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/admin/LogoutButton'

export default async function BarberPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/barber-portal/login')

  const adminClient = createAdminClient()
  const { data: barber } = await adminClient
    .from('barbers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single()

  if (!barber) redirect('/barber-portal/login')

  return (
    <div className="min-h-screen bg-canvas">
      <div className="bg-surface border-b border-line px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-fg font-display text-lg tracking-[0.14em]">PORTAL</span>
          <span className="text-muted text-xs font-sans">{barber.name}</span>
        </div>
        <LogoutButton redirectTo="/barber-portal/login" />
      </div>
      <div className="px-4 sm:px-6 lg:px-10 py-8">{children}</div>
    </div>
  )
}
