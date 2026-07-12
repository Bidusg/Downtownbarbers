import { createAdminClient } from '@/lib/supabase/server'
import WeekCalendar from '@/components/admin/WeekCalendar'

export default async function AdminDashboard() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: todayBookings } = await supabase
    .from('bookings')
    .select('status')
    .eq('booking_date', today)

  const total = todayBookings?.length ?? 0
  const confirmed = todayBookings?.filter(b => b.status === 'confirmed').length ?? 0
  const completed = todayBookings?.filter(b => b.status === 'completed').length ?? 0
  const cancelled = todayBookings?.filter(b => b.status === 'cancelled').length ?? 0

  const d = new Date(today + 'T12:00:00')
  const NB_DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag']
  const NB_MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
  const formattedToday = `${NB_DAYS[d.getDay()]} ${d.getDate()}. ${NB_MONTHS[d.getMonth()]}`

  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-xs font-sans uppercase tracking-[0.22em] mb-1">I dag</p>
        <h1 className="font-display text-2xl text-cream capitalize">{formattedToday}</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Timer i dag', value: total },
          { label: 'Bekreftet', value: confirmed },
          { label: 'Fullført', value: completed },
          { label: 'Kansellert', value: cancelled },
        ].map(stat => (
          <div key={stat.label} className="bg-ink-soft border border-stroke-dark px-4 py-3">
            <p className="text-2xl font-display text-cream">{stat.value}</p>
            <p className="text-[9px] text-muted font-sans mt-1 uppercase tracking-[0.18em]">{stat.label}</p>
          </div>
        ))}
      </div>

      <WeekCalendar adminMode />
    </div>
  )
}
