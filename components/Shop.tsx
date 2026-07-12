'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Image from 'next/image'

export default function Shop() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="butikk" ref={ref} className="bg-forest overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-0 min-h-[600px] lg:min-h-[700px]">
          {/* Text half */}
          <div className="flex flex-col justify-center py-20 lg:py-0 lg:pr-16 xl:pr-24">
            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6 }}
              className="text-forest-light text-[9px] tracking-[0.35em] font-sans mb-8"
            >
              NETTBUTIKK
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 44 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.25, 0, 0, 1] }}
              className="font-display text-cream leading-[0.88] tracking-tight mb-8"
              style={{ fontSize: 'clamp(42px, 5vw, 76px)' }}
            >
              Behold stilen
              <span className="block font-normal italic">hjemme.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.25, 0, 0, 1] }}
              className="text-cream/65 font-sans text-[15px] leading-[1.75] max-w-[48ch] mb-10"
            >
              Fra førsteklasses hårprodukter til nødvendigheter for skjeggpleie —
              ta Downtown Barbers-opplevelsen med hjem.
            </motion.p>

            <motion.a
              href="/shop"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="inline-flex items-center gap-3 self-start px-8 py-4 bg-cream text-ink text-[10px] tracking-[0.28em] font-sans hover:bg-cream-dark transition-colors duration-300"
            >
              GÅ TIL BUTIKKEN
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 6.5h11M7.5 2l5 4.5-5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.a>
          </div>

          {/* Image half */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 1.1, delay: 0.2, ease: [0.25, 0, 0, 1] }}
            className="relative hidden lg:block"
          >
            <Image
              src="https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=900&q=80"
              alt="Premium hårprodukter"
              fill
              className="object-cover"
              sizes="50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-forest/60 to-transparent" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
