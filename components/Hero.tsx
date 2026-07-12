'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

export default function Hero() {
  return (
    <section
      id="hjem"
      className="relative min-h-screen bg-ink flex flex-col justify-end overflow-hidden"
    >
      {/* Atmospheric right-side image */}
      <div className="absolute inset-y-0 right-0 w-1/2 xl:w-2/5 pointer-events-none">
        <Image
          src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=75"
          alt=""
          fill
          priority
          className="object-cover opacity-[0.18]"
          sizes="50vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-ink/20" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,transparent,transparent 79px,#F3F0E7 79px,#F3F0E7 80px),repeating-linear-gradient(90deg,transparent,transparent 79px,#F3F0E7 79px,#F3F0E7 80px)',
        }}
      />

      {/* Location strip */}
      <div className="absolute top-0 left-0 right-0 z-10 pt-32 lg:pt-40">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="text-muted text-[9px] tracking-[0.35em] font-sans"
          >
            OSLO &nbsp;·&nbsp; SIDEN 2013 &nbsp;·&nbsp; OSTERHAUS&apos; GATE 10
          </motion.p>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 max-w-[1440px] mx-auto px-6 lg:px-12 w-full pb-20 lg:pb-28">
        <div className="mb-10 lg:mb-12">
          <div className="overflow-hidden">
            <motion.h1
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1.05, delay: 0.05, ease: [0.25, 0, 0, 1] }}
              className="font-display text-cream leading-[0.87] tracking-tight"
              style={{ fontSize: 'clamp(52px, 9vw, 148px)' }}
            >
              <span className="block">Der presisjon</span>
              <span className="block font-normal italic text-cream/90">møter stil.</span>
            </motion.h1>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65, ease: [0.25, 0, 0, 1] }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-8 max-w-[900px]"
        >
          <p className="text-muted font-sans text-[15px] leading-relaxed max-w-[42ch]">
            Freshe klipper, skarpe fades og ekspert grooming — midt i hjertet av Oslo.
          </p>

          <Link
            href="/booking"
            className="shrink-0 inline-flex items-center gap-3 px-8 py-4 bg-forest text-cream text-[10px] tracking-[0.28em] font-sans hover:bg-forest-mid transition-colors duration-300"
          >
            BOOK NÅ
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 1 }}
        className="absolute bottom-8 right-12 hidden lg:flex items-center gap-3"
      >
        <div className="w-10 h-px bg-muted/30" />
        <span className="text-muted text-[9px] tracking-[0.3em] font-sans">SCROLL</span>
      </motion.div>
    </section>
  )
}
