'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import BookingSlideOver, { type BookingRow } from './BookingSlideOver'
import NewBookingSlideOver from './NewBookingSlideOver'
import { updateBooking } from '@/app/admin/actions'

const BARBER_COLORS: Record<string, string> = {
  Vani: '#3B82F6',
  Soren: '#10B981',
  Isak: '#8B5CF6',
  Stavros: '#F59E0B',
  David: '#EF4444',
  Mehetabel: '#EC4899',
}

const SLOT_H = 56
const START_H = 9
const END_H = 19
const TOTAL_SLOTS = (END_H - START_H) * 2

const DAYS_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør']
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
const MONTHS_LONG = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
const STATUS_NB: Record<string, string> = { confirmed: 'Bekreftet', completed: 'Fullført', cancelled: 'Kansellert' }

function toISO(d: Date) { return d.toISOString().split('T')[0] }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function getWeekStart(d: Date) {
  const r = new Date(d)
  const dow = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - dow)
  r.setHours(0, 0, 0, 0)
  return r
}
function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function toTime(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
function slotTop(t: string) { return ((toMin(t) - START_H * 60) / 30) * SLOT_H }
function slotHeight(mins: number) { return (mins / 30) * SLOT_H }
function barberColor(name: string) { return BARBER_COLORS[name] ?? '#6B7280' }

function timeFromY(rect: DOMRect, clientY: number): string {
  const relY = Math.max(0, clientY - rect.top)
  const slotIndex = Math.floor(relY / SLOT_H)
  const clamped = Math.min(slotIndex, TOTAL_SLOTS - 1)
  return toTime(START_H * 60 + clamped * 30)
}

function layoutDay(bookings: BookingRow[]): Map<string, { left: number; width: number }> {
  const result = new Map<string, { left: number; width: number }>()
  if (!bookings.length) return result
  const sorted = [...bookings].sort((a, b) => a.booking_time.localeCompare(b.booking_time))
  const colEnds: number[] = []
  const colIdx = new Map<string, number>()
  for (const b of sorted) {
    const s = toMin(b.booking_time)
    const e = s + (b.services?.duration_minutes ?? 30)
    let c = colEnds.findIndex(end => s >= end)
    if (c === -1) c = colEnds.length
    colEnds[c] = e
    colIdx.set(b.id, c)
  }
  const total = colEnds.length
  Array.from(colIdx.entries()).forEach(([id, c]) => {
    result.set(id, { left: c / total, width: 1 / total })
  })
  return result
}

interface BarberItem { id: string; name: string }

interface Props {
  barberId?: string
  adminMode?: boolean
}

export default function WeekCalendar({ barberId, adminMode }: Props) {
  const todayISO = toISO(new Date())
  const [ws, setWs] = useState(() => getWeekStart(new Date()))
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mobileDay, setMobileDay] = useState(() => Math.min((new Date().getDay() + 6) % 7, 5))

  // Barber portal popup (non-admin)
  const [popup, setPopup] = useState<BookingRow | null>(null)

  // Admin: slide-over + new booking
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null)
  const [newBookingOpen, setNewBookingOpen] = useState(false)
  const [newBookingDate, setNewBookingDate] = useState('')
  const [newBookingBarberId, setNewBookingBarberId] = useState('')

  // Admin: filter state
  const [allBarbers, setAllBarbers] = useState<BarberItem[]>([])
  const [activeBarbers, setActiveBarbers] = useState<Set<string>>(new Set())
  const [showCancelled, setShowCancelled] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Admin: drag & drop state
  const [dragging, setDragging] = useState<BookingRow | null>(null)
  const [dropHover, setDropHover] = useState<{ date: string; time: string } | null>(null)
  const [dropConfirm, setDropConfirm] = useState<{ booking: BookingRow; date: string; time: string } | null>(null)
  const [dropSubmitting, setDropSubmitting] = useState(false)
  const dragRef = useRef<BookingRow | null>(null)

  const days = Array.from({ length: 6 }, (_, i) => addDays(ws, i))

  const fetchBookings = useCallback(async () => {
    const sb = createClient()
    const from = toISO(ws)
    const to = toISO(addDays(ws, 5))
    let q = sb
      .from('bookings')
      .select('id,customer_name,customer_email,customer_phone,booking_date,booking_time,status,notes,services(id,name,duration_minutes,price),barbers(id,name)')
      .gte('booking_date', from)
      .lte('booking_date', to)
      .order('booking_time')
    if (barberId) q = (q as any).eq('barber_id', barberId)
    // Non-admin: hide cancelled
    if (!adminMode) q = (q as any).neq('status', 'cancelled')
    const { data } = await q
    setBookings((data as unknown as BookingRow[]) ?? [])
    setLoading(false)
  }, [ws, barberId, adminMode])

  useEffect(() => { setLoading(true); fetchBookings() }, [fetchBookings])

  useEffect(() => {
    const sb = createClient()
    const ch = sb
      .channel(`week-${toISO(ws)}${barberId ?? ''}${adminMode ? '-admin' : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchBookings)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [ws, barberId, adminMode, fetchBookings])

  // Fetch barbers list for admin filter chips
  useEffect(() => {
    if (!adminMode) return
    const sb = createClient()
    sb.from('barbers').select('id,name').eq('active', true).order('name')
      .then(({ data }) => setAllBarbers((data ?? []) as BarberItem[]))
  }, [adminMode])

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      if (!showCancelled && b.status === 'cancelled') return false
      if (activeBarbers.size > 0 && !activeBarbers.has(b.barbers?.name ?? '')) return false
      if (searchQuery.trim() && !b.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [bookings, showCancelled, activeBarbers, searchQuery])

  const timeSlots = Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const h = START_H + Math.floor(i / 2)
    const m = i % 2 === 0 ? '00' : '30'
    return `${String(h).padStart(2, '0')}:${m}`
  })

  const byDate = (iso: string) => filteredBookings.filter(b => b.booking_date === iso)

  const weekLabel = `${days[0].getDate()}. ${MONTHS_SHORT[days[0].getMonth()]} – ${days[5].getDate()}. ${MONTHS_SHORT[days[5].getMonth()]} ${days[5].getFullYear()}`
  const isCurrentWeek = toISO(getWeekStart(new Date())) === toISO(ws)

  const toggleBarber = (name: string) => {
    setActiveBarbers(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleBookingClick = (b: BookingRow) => {
    if (adminMode) setSelectedBooking(b)
    else setPopup(b)
  }

  const openNewBooking = (date: string, bId?: string) => {
    setNewBookingDate(date)
    setNewBookingBarberId(bId ?? '')
    setNewBookingOpen(true)
  }

  // Drag handlers
  const onDragStart = (e: React.DragEvent, b: BookingRow) => {
    dragRef.current = b
    setDragging(b)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', b.id)
  }

  const onDragOver = (e: React.DragEvent, iso: string) => {
    if (!dragRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const snappedTime = timeFromY(rect, e.clientY)
    setDropHover({ date: iso, time: snappedTime })
  }

  const onDragLeave = () => setDropHover(null)

  const onDrop = (e: React.DragEvent, iso: string) => {
    e.preventDefault()
    const b = dragRef.current
    if (!b) return
    const rect = e.currentTarget.getBoundingClientRect()
    const time = timeFromY(rect, e.clientY)
    setDragging(null)
    setDropHover(null)
    dragRef.current = null
    // If same slot, do nothing
    if (b.booking_date === iso && b.booking_time.slice(0, 5) === time) return
    setDropConfirm({ booking: b, date: iso, time })
  }

  const onDragEnd = () => {
    setDragging(null)
    setDropHover(null)
    dragRef.current = null
  }

  const confirmDrop = async () => {
    if (!dropConfirm) return
    setDropSubmitting(true)
    try {
      await updateBooking(dropConfirm.booking.id, { booking_date: dropConfirm.date, booking_time: dropConfirm.time })
      fetchBookings()
    } finally {
      setDropSubmitting(false)
      setDropConfirm(null)
    }
  }

  const getBlockStyle = (b: BookingRow, color: string) => {
    if (b.status === 'cancelled') {
      return { backgroundColor: '#374151', borderTop: '2px solid #6B7280' }
    }
    if (b.status === 'completed') {
      return { backgroundColor: `${color}0d`, borderTop: `2px solid ${color}50` }
    }
    return { backgroundColor: `${color}20`, borderTop: `2px solid ${color}` }
  }

  const getNameColor = (b: BookingRow, color: string) => {
    if (b.status === 'cancelled') return '#9CA3AF'
    if (b.status === 'completed') return `${color}80`
    return color
  }

  return (
    <div>
      {/* Navigation bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWs(d => addDays(d, -7))}
            className="w-8 h-8 flex items-center justify-center text-muted hover:text-cream border border-stroke-dark hover:border-forest/50 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-cream text-sm font-sans w-52 text-center">{weekLabel}</span>
          <button
            onClick={() => setWs(d => addDays(d, 7))}
            className="w-8 h-8 flex items-center justify-center text-muted hover:text-cream border border-stroke-dark hover:border-forest/50 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {!isCurrentWeek && (
          <button
            onClick={() => { setWs(getWeekStart(new Date())); setMobileDay(Math.min((new Date().getDay() + 6) % 7, 5)) }}
            className="px-3 py-1 text-[10px] font-sans text-muted hover:text-cream border border-stroke-dark hover:border-forest/50 transition-colors uppercase tracking-[0.14em]"
          >
            I dag
          </button>
        )}
        {adminMode && (
          <button
            onClick={() => openNewBooking(todayISO)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-forest hover:bg-forest-mid text-cream text-[10px] font-sans uppercase tracking-[0.16em] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1V9M1 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Ny time
          </button>
        )}
        {/* Barber legend — non-admin, no filter */}
        {!barberId && !adminMode && (
          <div className="hidden xl:flex items-center gap-4 ml-auto">
            {Object.entries(BARBER_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-muted font-sans">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin filter bar */}
      {adminMode && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Barber chips */}
          {allBarbers.map(b => {
            const color = barberColor(b.name)
            const active = activeBarbers.has(b.name)
            return (
              <button
                key={b.id}
                onClick={() => toggleBarber(b.name)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans border transition-colors ${
                  active
                    ? 'text-cream border-transparent'
                    : 'border-stroke-dark text-muted hover:text-cream hover:border-stroke-mid'
                }`}
                style={active ? { backgroundColor: `${color}25`, borderColor: `${color}60` } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? color : '#6B7280' }} />
                {b.name}
              </button>
            )
          })}

          <div className="w-px h-4 bg-stroke-dark mx-1 hidden sm:block" />

          {/* Cancelled toggle */}
          <button
            onClick={() => setShowCancelled(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-sans border transition-colors ${
              showCancelled
                ? 'border-stroke-mid text-cream/60 bg-ink-mid'
                : 'border-stroke-dark text-muted hover:text-cream'
            }`}
          >
            <span className={`w-3 h-3 border flex items-center justify-center transition-colors ${showCancelled ? 'border-muted bg-muted/20' : 'border-stroke-mid'}`}>
              {showCancelled && <svg width="7" height="7" viewBox="0 0 7 7" fill="none"><path d="M1 3.5L3 5.5L6 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </span>
            Vis kansellerte
          </button>

          {/* Search */}
          <div className="relative ml-auto">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/50" width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="4.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7 7L9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Søk kunde…"
              className="bg-ink border border-stroke-dark pl-7 pr-3 py-1 text-[11px] font-sans text-cream placeholder:text-muted/40 outline-none focus:border-forest/60 transition-colors w-36"
            />
          </div>
        </div>
      )}

      {/* Mobile day tabs */}
      <div className="flex sm:hidden gap-1 mb-3 overflow-x-auto pb-1">
        {days.map((d, i) => {
          const iso = toISO(d)
          const isToday = iso === todayISO
          const count = byDate(iso).length
          return (
            <button
              key={iso}
              onClick={() => setMobileDay(i)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-sans border transition-colors duration-150 ${
                mobileDay === i
                  ? 'border-forest bg-forest/10 text-cream'
                  : isToday
                  ? 'border-forest/40 text-muted hover:text-cream'
                  : 'border-stroke-dark text-muted hover:text-cream'
              }`}
            >
              {DAYS_SHORT[(d.getDay() + 6) % 7]} {d.getDate()}
              {count > 0 && <span className="ml-1" style={{ color: '#3D8A69' }}>·{count}</span>}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="border border-stroke-dark py-16 text-center text-muted font-sans text-sm">Laster kalender…</div>
      ) : (
        <div className="border border-stroke-dark overflow-x-auto">
          <div className="min-w-[480px]">
            {/* Day headers */}
            <div className="flex border-b border-stroke-dark">
              <div className="w-12 shrink-0 border-r border-stroke-dark" />
              {days.map((d, i) => {
                const iso = toISO(d)
                const isToday = iso === todayISO
                return (
                  <div
                    key={iso}
                    className={`flex-1 border-r border-stroke-dark last:border-r-0 ${isToday ? 'bg-forest/5' : ''} ${i !== mobileDay ? 'hidden sm:block' : ''}`}
                  >
                    <div className="flex items-center justify-between px-1.5 py-2">
                      <div className="text-center flex-1">
                        <p className={`text-[8px] tracking-[0.22em] font-sans uppercase ${isToday ? 'text-forest-light' : 'text-muted'}`}>
                          {DAYS_SHORT[(d.getDay() + 6) % 7]}
                        </p>
                        <p className={`text-sm font-sans font-medium leading-tight ${isToday ? 'text-cream' : 'text-cream/60'}`}>
                          {d.getDate()}
                        </p>
                      </div>
                      {adminMode && (
                        <button
                          onClick={() => openNewBooking(iso)}
                          className="text-muted/40 hover:text-forest-light transition-colors pr-1"
                          title="Ny time denne dagen"
                        >
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M5.5 1V10M1 5.5H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div className="flex">
              {/* Time axis */}
              <div className="w-12 shrink-0 border-r border-stroke-dark">
                {timeSlots.map((t, i) => (
                  <div key={t} style={{ height: SLOT_H }} className="flex items-start justify-end pr-2 border-b border-stroke-dark/20 last:border-0">
                    {i % 2 === 0 && (
                      <span className="text-[9px] text-muted/60 font-sans mt-1">{t}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d, di) => {
                const iso = toISO(d)
                const isToday = iso === todayISO
                const dayBookings = byDate(iso)
                const layout = layoutDay(dayBookings)
                const isDropTarget = dropHover?.date === iso

                return (
                  <div
                    key={iso}
                    className={`flex-1 relative border-r border-stroke-dark last:border-r-0 ${
                      isToday ? 'bg-forest/[0.03]' : ''
                    } ${di !== mobileDay ? 'hidden sm:block' : ''} ${
                      isDropTarget ? 'bg-forest/5' : ''
                    }`}
                    style={{ height: TOTAL_SLOTS * SLOT_H }}
                    onDragOver={adminMode ? (e) => onDragOver(e, iso) : undefined}
                    onDragLeave={adminMode ? onDragLeave : undefined}
                    onDrop={adminMode ? (e) => onDrop(e, iso) : undefined}
                  >
                    {/* Horizontal grid lines */}
                    {timeSlots.map((_, i) => (
                      <div
                        key={i}
                        className={`absolute w-full border-b ${i % 2 === 0 ? 'border-stroke-dark/25' : 'border-stroke-dark/10'}`}
                        style={{ top: i * SLOT_H, height: SLOT_H }}
                      />
                    ))}

                    {/* Drop indicator line */}
                    {adminMode && isDropTarget && dropHover && (
                      <div
                        className="absolute w-full pointer-events-none z-20"
                        style={{ top: slotTop(dropHover.time) - 1, height: 2, backgroundColor: '#3D8A69' }}
                      />
                    )}

                    {/* Empty state */}
                    {dayBookings.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[9px] text-muted/25 font-sans uppercase tracking-widest">Ledig</span>
                      </div>
                    )}

                    {/* Booking blocks */}
                    {dayBookings.map(b => {
                      const color = barberColor(b.barbers?.name ?? '')
                      const pos = layout.get(b.id) ?? { left: 0, width: 1 }
                      const top = slotTop(b.booking_time)
                      const rawHeight = slotHeight(b.services?.duration_minutes ?? 30)
                      const clampedTop = Math.max(0, top)
                      const clampedHeight = Math.max(22, Math.min(rawHeight, TOTAL_SLOTS * SLOT_H - clampedTop))
                      const isDraggingThis = dragging?.id === b.id

                      return (
                        <button
                          key={b.id}
                          draggable={adminMode}
                          onDragStart={adminMode ? (e) => onDragStart(e, b) : undefined}
                          onDragEnd={adminMode ? onDragEnd : undefined}
                          onClick={() => handleBookingClick(b)}
                          style={{
                            position: 'absolute',
                            top: clampedTop + 1,
                            height: clampedHeight - 2,
                            left: `calc(${pos.left * 100}% + 1px)`,
                            width: `calc(${pos.width * 100}% - 2px)`,
                            ...getBlockStyle(b, color),
                            opacity: isDraggingThis ? 0.35 : b.status === 'completed' ? 0.65 : 1,
                            cursor: adminMode ? 'grab' : 'pointer',
                          }}
                          className="text-left overflow-hidden px-1.5 py-1 hover:brightness-125 transition-all duration-100 group active:cursor-grabbing"
                        >
                          <p
                            className="text-[10px] font-sans font-semibold leading-tight truncate"
                            style={{
                              color: getNameColor(b, color),
                              textDecoration: b.status === 'cancelled' ? 'line-through' : 'none',
                            }}
                          >
                            {b.customer_name}
                          </p>
                          {clampedHeight > 38 && (
                            <p className="text-[9px] font-sans leading-tight mt-0.5 truncate" style={{ color: `${getNameColor(b, color)}99` }}>
                              {b.services?.name}
                            </p>
                          )}
                          {clampedHeight > 56 && (
                            <p className="text-[9px] font-sans leading-tight mt-0.5" style={{ color: `${getNameColor(b, color)}70` }}>
                              {b.booking_time.slice(0, 5)}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Admin: Booking slide-over */}
      {adminMode && (
        <BookingSlideOver
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdated={() => { fetchBookings(); setSelectedBooking(null) }}
        />
      )}

      {/* Admin: New booking slide-over */}
      {adminMode && (
        <NewBookingSlideOver
          open={newBookingOpen}
          defaultDate={newBookingDate}
          defaultBarberId={newBookingBarberId}
          onClose={() => setNewBookingOpen(false)}
          onCreated={() => { fetchBookings(); setNewBookingOpen(false) }}
        />
      )}

      {/* Admin: Drop confirmation dialog */}
      {adminMode && dropConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-[2px]">
          <div className="bg-ink-soft border border-stroke-dark w-full max-w-xs shadow-2xl p-6">
            <p className="text-cream font-sans font-semibold mb-1">Flytt time?</p>
            <p className="text-muted text-sm font-sans mb-4">
              {dropConfirm.booking.customer_name} flyttes til{' '}
              <span className="text-cream">
                {(() => {
                  const d = new Date(dropConfirm.date + 'T12:00:00')
                  return `${DAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} kl ${dropConfirm.time}`
                })()}
              </span>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmDrop}
                disabled={dropSubmitting}
                className="flex-1 py-2.5 bg-forest hover:bg-forest-mid text-cream text-xs font-sans uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
              >
                {dropSubmitting ? 'Lagrer…' : 'Bekreft'}
              </button>
              <button
                onClick={() => setDropConfirm(null)}
                className="flex-1 py-2.5 border border-stroke-dark text-muted hover:text-cream text-xs font-sans uppercase tracking-[0.16em] transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barber portal: simple popup */}
      {!adminMode && popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/75 backdrop-blur-sm"
          onClick={() => setPopup(null)}
        >
          <div
            className="bg-ink-soft border border-stroke-dark w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1 w-full" style={{ backgroundColor: barberColor(popup.barbers?.name ?? '') }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-cream font-sans font-semibold text-base">{popup.customer_name}</p>
                  <p className="text-muted text-xs font-sans mt-0.5">
                    {(() => {
                      const d = new Date(popup.booking_date + 'T12:00:00')
                      return `${DAYS_SHORT[(d.getDay() + 6) % 7]}. ${d.getDate()}. ${MONTHS_LONG[d.getMonth()]} kl ${popup.booking_time.slice(0, 5)}`
                    })()}
                  </p>
                </div>
                <button onClick={() => setPopup(null)} className="text-muted hover:text-cream transition-colors -mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3">
                {([
                  ['Tjeneste', popup.services?.name ?? '–'],
                  ['Barber', popup.barbers?.name ?? '–'],
                  ['Telefon', popup.customer_phone],
                  ['E-post', popup.customer_email],
                  ['Status', STATUS_NB[popup.status] ?? popup.status],
                  ...(popup.notes ? [['Merknad', popup.notes] as [string, string]] : []),
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex gap-4">
                    <span className="text-[9px] tracking-[0.22em] text-muted font-sans uppercase w-16 shrink-0 pt-0.5">{label}</span>
                    <span className="text-cream text-sm font-sans break-all">{value}</span>
                  </div>
                ))}
              </div>
              <a
                href={`tel:${popup.customer_phone}`}
                className="mt-5 flex items-center justify-center gap-2 w-full py-2 border border-stroke-dark hover:border-forest/50 text-muted hover:text-cream text-xs font-sans uppercase tracking-[0.14em] transition-colors duration-150"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M10.5 8.5c0 .2-.04.39-.13.57a1.88 1.88 0 0 1-.36.52c-.21.22-.44.38-.7.47-.25.09-.52.14-.81.14-.42 0-.87-.1-1.34-.3a10.4 10.4 0 0 1-1.34-.79 10.24 10.24 0 0 1-1.27-1.26A10.3 10.3 0 0 1 3.77 6.4c-.2-.47-.3-.91-.3-1.33 0-.28.05-.55.14-.8.09-.26.24-.5.46-.71.22-.22.46-.33.72-.33.1 0 .2.02.29.06.1.04.18.1.25.2l.85 1.19c.07.1.12.2.16.3.04.09.06.18.06.26 0 .1-.03.2-.08.3-.05.1-.12.2-.21.29l-.28.3a.2.2 0 0 0-.06.15c0 .03 0 .06.02.1.02.03.04.06.06.09.15.26.33.51.55.75.22.24.46.46.72.66.03.02.06.04.1.06.04.02.07.02.1.02a.2.2 0 0 0 .15-.07l.28-.29c.09-.1.19-.17.29-.21.1-.05.2-.07.3-.07.08 0 .17.02.26.06.1.04.2.09.3.16l1.2.87c.1.07.16.15.2.25.03.1.05.2.05.31Z" stroke="currentColor" strokeWidth="1" strokeMiterlimit="10"/>
                </svg>
                Ring {popup.customer_name.split(' ')[0]}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
