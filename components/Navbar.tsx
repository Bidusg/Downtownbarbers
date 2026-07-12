'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

const navLinks = [
  { label: 'HJEM', href: '#hjem' },
  { label: 'OM OSS', href: '#om-oss' },
  { label: 'TJENESTER', href: '#tjenester' },
  { label: 'TEAM', href: '#team' },
  { label: 'NETTBUTIKK', href: '/shop' },
  { label: 'LEDIGE STILLINGER', href: '#jobb' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-ink/96 backdrop-blur-md py-3 border-b border-stroke-dark' : 'bg-transparent py-6'
      }`}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.25, 0, 0, 1] }}
    >
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 flex items-center justify-between">
        <Link href="#hjem" className="flex flex-col leading-none group">
          <span className="font-display text-cream text-[9px] tracking-[0.35em] font-light">
            DOWNTOWN
          </span>
          <span className="font-display text-cream text-[22px] tracking-[0.18em] font-bold leading-tight">
            BARBERS
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-cream/60 hover:text-cream text-[10px] tracking-[0.22em] font-sans transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/booking"
            className="hidden lg:inline-flex items-center px-6 py-2.5 border border-forest text-forest hover:bg-forest hover:text-cream text-[10px] tracking-[0.22em] font-sans transition-all duration-300"
          >
            BOOK NÅ
          </Link>

          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden flex flex-col gap-[5px] p-1.5"
            aria-label={open ? 'Lukk meny' : 'Åpne meny'}
          >
            <span
              className={`block w-6 h-px bg-cream origin-center transition-all duration-300 ${
                open ? 'rotate-45 translate-y-[7px]' : ''
              }`}
            />
            <span
              className={`block w-4 h-px bg-cream transition-all duration-300 ${
                open ? 'opacity-0 translate-x-2' : ''
              }`}
            />
            <span
              className={`block w-6 h-px bg-cream origin-center transition-all duration-300 ${
                open ? '-rotate-45 -translate-y-[7px]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0, 0, 1] }}
            className="lg:hidden overflow-hidden bg-ink/98 border-t border-stroke-dark"
          >
            <div className="max-w-[1440px] mx-auto px-6 py-6 flex flex-col gap-1">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block text-cream/70 hover:text-cream text-[11px] tracking-[0.22em] font-sans py-3 border-b border-stroke-dark/40 transition-colors"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <Link
                href="/booking"
                className="mt-4 block text-center py-3.5 border border-forest text-forest text-[10px] tracking-[0.25em] font-sans hover:bg-forest hover:text-cream transition-all duration-300"
                onClick={() => setOpen(false)}
              >
                BOOK NÅ
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
