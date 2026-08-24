'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Link from 'next/link'

const team = [
  { name: 'Vani', role: 'Barber', bg: '#243B2E' },
  { name: 'Soren', role: 'Barber', bg: '#1F2E38' },
  { name: 'Isak', role: 'Barber', bg: '#33271C' },
  { name: 'Stavros', role: 'Barber', bg: '#27223A' },
  { name: 'David', role: 'Master Barber', bg: '#1B4032' },
  { name: 'Mehetabel', role: 'Lærling', bg: '#3A2020' },
]

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
}

const card = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.25, 0, 0, 1] } },
}

export default function Team() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="team" ref={ref} className="bg-surface-2 py-24 lg:py-36">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="text-muted text-[9px] tracking-[0.35em] font-sans mb-4"
        >
          TEAMET
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 32 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0, 0, 1] }}
          className="font-display text-fg leading-[0.88] tracking-tight mb-16"
          style={{ fontSize: 'clamp(40px, 5vw, 72px)' }}
        >
          Møt folkene
          <span className="block font-normal italic text-accent-soft">bak saksene.</span>
        </motion.h2>

        <motion.div
          variants={container}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5"
        >
          {team.map((member) => (
            <motion.div key={member.name} variants={card} className="group cursor-pointer">
              <div
                className="relative aspect-square mb-4 overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: member.bg }}
              >
                <span
                  className="font-display text-[56px] font-bold select-none transition-opacity duration-300 group-hover:opacity-0"
                  style={{ color: 'rgba(243,240,231,0.08)' }}
                >
                  {member.name[0]}
                </span>

                {/* Hover state */}
                <div className="absolute inset-0 bg-accent opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex flex-col items-center justify-center gap-3">
                  <p className="text-accent-fg font-display text-lg tracking-wide">{member.name}</p>
                  <Link
                    href="/booking"
                    className="text-accent-fg/80 text-[9px] tracking-[0.28em] font-sans border border-accent-fg/30 px-4 py-2 hover:bg-accent-fg/10 transition-colors duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    BOOK
                  </Link>
                </div>
              </div>

              <p className="font-sans text-fg text-sm font-medium leading-tight">{member.name}</p>
              <p className="font-sans text-muted text-[10px] tracking-[0.15em] mt-0.5">
                {member.role.toUpperCase()}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
