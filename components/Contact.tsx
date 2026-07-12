'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

export default function Contact() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  const col = (delay: number) => ({
    initial: { opacity: 0, y: 32 },
    animate: inView ? { opacity: 1, y: 0 } : {},
    transition: { duration: 0.8, delay, ease: [0.25, 0, 0, 1] as const },
  })

  return (
    <section id="kontakt" ref={ref} className="bg-ink py-24 lg:py-36">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="text-muted text-[9px] tracking-[0.35em] font-sans mb-16"
        >
          KONTAKT & ÅPNINGSTIDER
        </motion.p>

        <div className="grid md:grid-cols-3 gap-12 lg:gap-16">
          {/* Adresse */}
          <motion.div {...col(0.1)}>
            <p className="text-forest-light text-[9px] tracking-[0.3em] font-sans mb-5">ADRESSE</p>
            <address className="not-italic font-display text-cream leading-snug mb-5" style={{ fontSize: 'clamp(20px, 1.8vw, 26px)' }}>
              Osterhaus&apos; gate 10<br />
              0183 Oslo
            </address>
            <a
              href="https://maps.google.com/?q=Osterhaus+gate+10,+0183+Oslo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-muted text-[10px] tracking-[0.2em] font-sans hover:text-cream transition-colors duration-200"
            >
              VIS KART
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 5.5h9M6 1.5l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </motion.div>

          {/* Åpningstider */}
          <motion.div {...col(0.2)}>
            <p className="text-forest-light text-[9px] tracking-[0.3em] font-sans mb-5">ÅPNINGSTIDER</p>
            <dl className="space-y-0">
              {[
                { day: 'Mandag – fredag', time: '09:00 – 19:00' },
                { day: 'Lørdag', time: '09:00 – 19:00' },
                { day: 'Søndag', time: 'Stengt' },
              ].map(({ day, time }, i) => (
                <div
                  key={day}
                  className={`flex items-center justify-between py-3.5 ${
                    i < 2 ? 'border-b border-stroke-dark' : ''
                  }`}
                >
                  <dt className="text-muted font-sans text-sm">{day}</dt>
                  <dd
                    className={`font-sans text-sm ${
                      time === 'Stengt' ? 'text-muted/60' : 'text-cream'
                    }`}
                  >
                    {time}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Telefon + gavekort */}
          <motion.div {...col(0.3)}>
            <p className="text-forest-light text-[9px] tracking-[0.3em] font-sans mb-5">TELEFON</p>
            <a
              href="tel:+4746358764"
              className="block font-display text-cream hover:text-forest-light transition-colors duration-200 mb-10"
              style={{ fontSize: 'clamp(22px, 2vw, 30px)' }}
            >
              +47 463 58 764
            </a>

            <div className="border border-stroke-dark p-5">
              <p className="text-forest-light text-[9px] tracking-[0.3em] font-sans mb-3">GAVEKORT</p>
              <p className="text-cream/55 font-sans text-sm leading-relaxed mb-4">
                Gi bort en opplevelse. Gavekort er tilgjengelig i butikken.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-forest text-[10px] tracking-[0.2em] font-sans hover:text-forest-light transition-colors duration-200"
              >
                LES MER
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1 5.5h9M6 1.5l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
