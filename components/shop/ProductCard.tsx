'use client'

/**
 * Product card. "Kjøp nå" opens Shopify's hosted checkout in real mode;
 * in mock mode it shows a short demo notice inline.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ShopProduct } from '@/lib/shopify'

const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  minimumFractionDigits: 0,
})

export default function ProductCard({ product }: { product: ShopProduct }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'demo' | 'error'>('idle')

  const buy = async () => {
    if (!product.available) return
    setStatus('loading')
    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: product.variantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      if (data.isMock || !data.checkoutUrl) {
        setStatus('demo')
        return
      }
      window.location.href = data.checkoutUrl
    } catch {
      setStatus('error')
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group bg-ink-soft border border-stroke-dark hover:border-forest/50 transition-colors duration-300 flex flex-col"
    >
      {/* Image */}
      <div className="aspect-square bg-gradient-to-br from-ink-mid to-ink-soft border-b border-stroke-dark/60 grid place-items-center overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.imageAlt ?? product.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-muted/40 text-[9px] tracking-[0.3em] font-sans uppercase"
          >
            Produktbilde
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-2.5 flex-grow">
        <h2 className="font-display text-cream text-lg leading-snug">{product.title}</h2>
        <p className="text-muted font-sans text-[13px] leading-relaxed flex-grow">
          {product.description}
        </p>

        <div className="flex items-center justify-between mt-3 pt-4 border-t border-stroke-dark/50">
          <span className="font-display text-cream text-xl">
            {nok.format(Number(product.price.amount))}
          </span>

          <button
            onClick={buy}
            disabled={!product.available || status === 'loading'}
            className="px-5 py-2.5 bg-forest hover:bg-forest-mid text-cream text-[10px] tracking-[0.2em] font-sans uppercase transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-forest"
          >
            {!product.available
              ? 'Utsolgt'
              : status === 'loading'
                ? 'Åpner kassen …'
                : 'Kjøp nå'}
          </button>
        </div>

        {status === 'demo' && (
          <p role="status" className="text-muted font-sans text-xs leading-relaxed">
            Demo-modus: kassen aktiveres når butikken er koblet til.
          </p>
        )}
        {status === 'error' && (
          <p role="alert" className="text-red-300 font-sans text-xs leading-relaxed">
            Kunne ikke åpne kassen. Prøv igjen om litt.
          </p>
        )}
      </div>
    </motion.article>
  )
}
