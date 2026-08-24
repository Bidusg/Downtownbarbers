'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { completeBookingWithPayment } from '@/app/admin/actions'
import type { BookingRow } from './BookingSlideOver'

type ModalState = 'idle' | 'vipps-pending' | 'success' | 'failed'

const MONTHS_SHORT = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des']
const DAYS_SHORT = ['søn','man','tir','ons','tor','fre','lør']

function fmtDate(iso: string, time: string) {
  const d = new Date(iso + 'T12:00:00')
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]} kl ${time.slice(0, 5)}`
}

// ─── Animated icons ────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <motion.svg
      viewBox="0 0 52 52" width="72" height="72"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 16 }}
    >
      <motion.circle
        cx="26" cy="26" r="23"
        fill="none" stroke="#10B981" strokeWidth="2.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
      <motion.path
        d="M 12 27 L 22 37 L 40 16"
        fill="none" stroke="#10B981" strokeWidth="3.5"
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.38, duration: 0.38, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

function XIcon() {
  return (
    <motion.svg
      viewBox="0 0 52 52" width="72" height="72"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 16 }}
    >
      <motion.circle
        cx="26" cy="26" r="23"
        fill="none" stroke="#EF4444" strokeWidth="2.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
      <motion.path
        d="M 15 15 L 37 37"
        stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.38, duration: 0.28 }}
      />
      <motion.path
        d="M 37 15 L 15 37"
        stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.54, duration: 0.28 }}
      />
    </motion.svg>
  )
}

function VippsSpinner() {
  // ~270° arc (circumference of r=22 circle ≈ 138; 75% = 104, gap = 34)
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
    >
      <svg viewBox="0 0 52 52" width="72" height="72">
        <circle
          cx="26" cy="26" r="22"
          fill="none"
          stroke="#FF5B24"
          strokeWidth="3.5"
          strokeDasharray="104 34"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  booking: BookingRow
  onClose: () => void
  onCompleted: () => void
}

const VIEW = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PaymentModal({ booking, onClose, onCompleted }: Props) {
  const [state, setState] = useState<ModalState>('idle')
  const [method, setMethod] = useState<'vipps' | 'cash'>('cash')
  const [cashLoading, setCashLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  const price = booking.services?.price ?? 0

  useEffect(() => {
    return () => {
      mounted.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const saveAndComplete = async (m: 'vipps' | 'cash') => {
    try {
      await completeBookingWithPayment(booking.id, m)
      if (mounted.current) {
        // Batch both updates in the same synchronous block so React 18
        // processes them as a single render — prevents cashLoading firing
        // a separate render that can race with the AnimatePresence transition.
        setCashLoading(false)
        setState('success')
      }
    } catch {
      if (mounted.current) {
        setCashLoading(false)
        setState('failed')
      }
    }
  }

  const handleVipps = async () => {
    setMethod('vipps')
    setState('vipps-pending')
    try {
      const res = await fetch('/api/vipps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Vipps create failed')

      if (data.mode === 'mock') {
        // Simulated approval delay, then complete through the real code
        // path: the mock webhook marks the booking paid in Supabase.
        timerRef.current = setTimeout(async () => {
          try {
            const hook = await fetch(data.redirectUrl)
            if (!hook.ok) throw new Error('mock webhook failed')
            if (mounted.current) setState('success')
          } catch {
            if (mounted.current) setState('failed')
          }
        }, 3000)
      } else {
        // Test/production: hand over to Vipps' hosted payment page.
        window.location.href = data.redirectUrl
      }
    } catch {
      if (mounted.current) setState('failed')
    }
  }

  const handleCash = async () => {
    setMethod('cash')
    setCashLoading(true)
    await saveAndComplete('cash')
    // setCashLoading(false) is now inside saveAndComplete — no extra render here
  }

  const handleCancelVipps = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setState('idle')
  }

  const handleBackdropClick = () => {
    if (state === 'idle') onClose()
    // Block close during active payment or on success (must use Lukk button)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-canvas/85 backdrop-blur-[3px]"
        onClick={handleBackdropClick}
      />

      {/* Modal box */}
      <motion.div
        className="relative z-10 bg-surface border border-line w-full max-w-sm shadow-2xl overflow-hidden"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        transition={{ type: 'tween', duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <AnimatePresence mode="wait">

          {/* ── IDLE ─────────────────────────────────────── */}
          {state === 'idle' && (
            <motion.div key="idle" {...VIEW} transition={{ duration: 0.15 }}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                <p className="text-[9px] tracking-[0.28em] text-muted font-sans uppercase">Fullfør betaling</p>
                <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              {/* Booking summary */}
              <div className="px-5 pt-6 pb-5 border-b border-line/40 text-center">
                <p className="text-fg/80 text-xs font-sans mb-0.5">
                  {booking.customer_name}
                </p>
                <p className="text-muted text-[10px] font-sans mb-1">
                  {booking.barbers?.name} — {booking.services?.name}
                </p>
                <p className="text-muted/50 text-[9px] font-sans tracking-wide mb-5">
                  {fmtDate(booking.booking_date, booking.booking_time)}
                </p>

                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="font-display text-[3.25rem] text-fg leading-none tracking-tight">
                    {price.toLocaleString('nb-NO')}
                  </span>
                  <span className="text-xl text-muted font-sans font-light">kr</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="p-5 space-y-2.5">
                <button
                  onClick={handleVipps}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 text-white font-sans font-semibold text-sm transition-opacity hover:opacity-90 active:scale-[0.99]"
                  style={{ backgroundColor: '#FF5B24' }}
                >
                  {/* Phone icon for Vipps */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="1" width="10" height="14" rx="2" stroke="white" strokeWidth="1.4"/>
                    <circle cx="8" cy="12" r="0.8" fill="white"/>
                  </svg>
                  Betal med Vipps
                </button>

                <button
                  onClick={handleCash}
                  disabled={cashLoading}
                  className="w-full py-3.5 bg-accent hover:bg-accent-hover text-accent-fg font-sans text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {cashLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span
                        className="inline-block w-3.5 h-3.5 border border-fg/40 border-t-fg rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                      />
                      Registrerer…
                    </span>
                  ) : 'Betalt i kasse'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── VIPPS PENDING ────────────────────────────── */}
          {state === 'vipps-pending' && (
            <motion.div key="vipps-pending" {...VIEW} transition={{ duration: 0.15 }} className="px-6 py-10 text-center">
              <div className="flex justify-center mb-6">
                <VippsSpinner />
              </div>
              <p className="text-fg font-sans font-semibold text-lg mb-1.5">
                Venter på Vipps-betaling…
              </p>
              <p className="text-muted text-sm font-sans mb-2">
                Kunden godkjenner i Vipps-appen
              </p>
              <p className="text-fg/60 text-sm font-sans font-medium mb-8">
                {price.toLocaleString('nb-NO')} kr · {booking.barbers?.name}
              </p>
              <button
                onClick={handleCancelVipps}
                className="px-6 py-2 border border-line text-muted hover:text-fg text-xs font-sans uppercase tracking-[0.16em] transition-colors"
              >
                Avbryt
              </button>
            </motion.div>
          )}

          {/* ── SUCCESS ──────────────────────────────────── */}
          {state === 'success' && (
            <motion.div key="success" {...VIEW} transition={{ duration: 0.15 }} className="px-6 py-10 text-center">
              <div className="flex justify-center mb-5">
                <CheckIcon />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62, duration: 0.3 }}
              >
                <p className="text-fg font-sans font-semibold text-xl mb-3">
                  Betaling mottatt!
                </p>
                <div className="flex items-baseline justify-center gap-1.5 mb-1">
                  <span className="font-display text-4xl text-fg leading-none">
                    {price.toLocaleString('nb-NO')}
                  </span>
                  <span className="text-lg text-muted font-sans">kr</span>
                </div>
                <p className="text-[9px] tracking-[0.24em] text-muted font-sans uppercase mb-6">
                  {method === 'vipps' ? 'Vipps' : 'Kasse'}
                </p>

                <div className="border-t border-line/50 pt-4 mb-6">
                  <p className="text-fg/70 text-sm font-sans">{booking.customer_name}</p>
                  <p className="text-muted text-xs font-sans mt-0.5">
                    {booking.services?.name} · {booking.barbers?.name}
                  </p>
                </div>

                <button
                  onClick={onCompleted}
                  className="w-full py-3 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-sans uppercase tracking-[0.18em] transition-colors"
                >
                  Lukk
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ── FAILED ───────────────────────────────────── */}
          {state === 'failed' && (
            <motion.div key="failed" {...VIEW} transition={{ duration: 0.15 }} className="px-6 py-10 text-center">
              <div className="flex justify-center mb-5">
                <XIcon />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.62, duration: 0.3 }}
              >
                <p className="text-danger font-sans font-semibold text-xl mb-2">
                  Betaling feilet
                </p>
                <p className="text-muted text-sm font-sans mb-8">
                  Kunden kansellerte eller betalingen ble avvist
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={handleVipps}
                    className="flex-1 py-2.5 border text-xs font-sans uppercase tracking-[0.14em] transition-colors hover:opacity-90"
                    style={{ borderColor: '#FF5B2466', color: '#FF5B24' }}
                  >
                    Prøv igjen
                  </button>
                  <button
                    onClick={handleCash}
                    disabled={cashLoading}
                    className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-accent-fg text-xs font-sans uppercase tracking-[0.14em] transition-colors disabled:opacity-50"
                  >
                    Betalt i kasse
                  </button>
                </div>

                <button
                  onClick={onClose}
                  className="mt-3 text-muted/50 hover:text-muted text-xs font-sans transition-colors"
                >
                  Avbryt
                </button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
