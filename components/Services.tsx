'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

const services = [
  {
    num: '01',
    category: 'HÅRKLIPP',
    headline: 'Klipp skarpt.',
    sub: 'Se enda skarpere ut.',
    body: 'Skin fade, klassisk klipp og teksturering — presist utført for ditt hår og din stil.',
    img: 'https://images.unsplash.com/photo-1596728325488-58c87691e9af?w=700&q=80',
    alt: 'Hårklipp hos Downtown Barbers',
  },
  {
    num: '02',
    category: 'GROOMING & SKJEGG',
    headline: 'Skjegget,',
    sub: 'perfeksjonert.',
    body: 'Stell, forming og trimming av skjegg med ekspert hånd. Barbering inkludert.',
    img: 'https://images.unsplash.com/photo-1599351431613-18ef1fdd27e1?w=700&q=80',
    alt: 'Skjeggpleie hos Downtown Barbers',
  },
  {
    num: '03',
    category: 'ANSIKT & DETALJER',
    headline: 'Detaljene som',
    sub: 'gjør forskjellen.',
    body: 'Voksing, farging og permanentbehandlinger for det komplette resultatet.',
    img: 'https://images.unsplash.com/photo-1560869713-bf31037d9636?w=700&q=80',
    alt: 'Ansiktsbehandling hos Downtown Barbers',
  },
]

export default function Services() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="tjenester" ref={ref} className="bg-ink py-24 lg:py-36">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-16">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6 }}
              className="text-muted text-[9px] tracking-[0.35em] font-sans mb-4"
            >
              TJENESTER
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 32 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0, 0, 1] }}
              className="font-display text-cream leading-none tracking-tight"
              style={{ fontSize: 'clamp(36px, 4.5vw, 64px)' }}
            >
              Hva vi gjør
              <span className="text-forest">.</span>
            </motion.h2>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="shrink-0 self-start sm:self-auto"
          >
            <Link
              href="/booking"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 border border-forest text-forest text-[10px] tracking-[0.25em] font-sans hover:bg-forest hover:text-cream transition-all duration-300"
            >
              BESTILL NÅ
            </Link>
          </motion.div>
        </div>

        {/* Service cards */}
        <div className="grid md:grid-cols-3 gap-px bg-stroke-dark">
          {services.map((s, i) => (
            <motion.article
              key={s.num}
              initial={{ opacity: 0, y: 48 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.85, delay: 0.12 * i, ease: [0.25, 0, 0, 1] }}
              className="group bg-ink-soft hover:bg-ink-mid transition-colors duration-400 p-7 flex flex-col gap-5"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={s.img}
                  alt={s.alt}
                  fill
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>

              <div className="flex items-start justify-between">
                <span className="text-muted text-[9px] tracking-[0.3em] font-sans">{s.category}</span>
                <span className="text-stroke-dark text-[10px] tracking-[0.15em] font-sans">{s.num}</span>
              </div>

              <h3 className="font-display text-cream leading-tight" style={{ fontSize: 'clamp(24px, 2.2vw, 30px)' }}>
                {s.headline}
                <br />
                <span className="font-normal italic">{s.sub}</span>
              </h3>

              <p className="text-muted/80 font-sans text-sm leading-relaxed flex-1">{s.body}</p>

              <Link
                href="/booking"
                className="inline-flex items-center gap-2 text-forest text-[10px] tracking-[0.2em] font-sans hover:text-forest-light transition-colors duration-200 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300"
              >
                BOOK DENNE →
              </Link>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
