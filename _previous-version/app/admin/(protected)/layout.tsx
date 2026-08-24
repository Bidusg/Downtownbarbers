import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import AdminNav from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const adminClient = createAdminClient()
  const { data: adminRow } = await adminClient
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!adminRow) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-canvas">
      <AdminNav />
      <div className="px-6 lg:px-10 py-8">{children}</div>
    </div>
  )
}
