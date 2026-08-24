'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Image from 'next/image'

export default function About() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section id="om-oss" ref={ref} className="bg-surface-2 py-24 lg:py-36">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="text-muted text-[9px] tracking-[0.35em] font-sans mb-14"
        >
          OM OSS
        </motion.p>

        <div className="grid lg:grid-cols-[1fr_1fr] gap-16 lg:gap-24 items-start">
          {/* Text column */}
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 48 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.25, 0, 0, 1] }}
              className="font-display text-fg leading-[0.88] tracking-tight mb-10"
              style={{ fontSize: 'clamp(44px, 5.5vw, 80px)' }}
            >
              Nesten
              <span className="block text-accent-soft font-normal italic">12 år</span>
              i Oslo.
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.25, 0, 0, 1] }}
              className="space-y-5 text-fg/70 font-sans text-[15px] leading-[1.75] max-w-[52ch]"
            >
              <p>
                Vi har servert kunder i Oslo i nesten 12 år. Med spesialisering innen
                skin fade-teknikker og hårklipp for alle hårtyper, tilbyr vi en
                komplett grooming-opplevelse du ikke finner andre steder.
              </p>
              <p>
                Fra voksing og farging til permanentbehandlinger — teamet vårt av
                kvalifiserte barberer og stylister gir personlig veiledning og
                presise resultater hver gang.
              </p>
            </motion.div>

            <motion.a
              href="#jobb"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.7, delay: 0.45 }}
              className="inline-flex items-center gap-2.5 mt-12 text-accent font-sans text-[10px] tracking-[0.25em] border-b border-accent pb-1 hover:text-accent-hover hover:border-accent-hover transition-colors duration-200"
            >
              BLI EN DEL AV TEAMET
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 6h10M7 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.a>
          </div>

          {/* Image column */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 1.1, delay: 0.15, ease: [0.25, 0, 0, 1] }}
            className="relative aspect-[3/4] overflow-hidden"
          >
            <Image
              src="https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=900&q=80"
              alt="Downtown Barbers i arbeid"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-soft" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
