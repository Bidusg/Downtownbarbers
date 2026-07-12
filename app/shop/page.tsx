import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ProductGrid from '@/components/shop/ProductGrid'
import { getProducts } from '@/lib/shopify'

export const metadata: Metadata = {
  title: 'Nettbutikk | Downtown Barbers',
  description:
    'Produktene vi bruker i stolen — styling, skjeggpleie og tilbehør fra Downtown Barbers.',
}

export const revalidate = 60

export default async function ShopPage() {
  const { products, isMock } = await getProducts()

  return (
    <>
      <Navbar />
      <main className="bg-ink min-h-screen">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-36 pb-16">
          <p className="text-muted text-[9px] tracking-[0.35em] font-sans mb-6">NETTBUTIKK</p>
          <h1
            className="font-display text-cream leading-[0.88] tracking-tight mb-4"
            style={{ fontSize: 'clamp(44px, 6vw, 96px)' }}
          >
            Behold stilen
            <span className="block font-normal italic text-cream/85">hjemme.</span>
          </h1>
          <p className="text-muted font-sans text-[15px] leading-relaxed max-w-[48ch] mt-6">
            Håndplukket av barberne våre. Bestill her — betaling, frakt og
            kvittering håndteres trygt i kassen.
          </p>

          {isMock && (
            <p
              role="status"
              className="inline-block mt-8 px-3 py-1.5 border border-stroke-dark text-muted text-[10px] tracking-[0.2em] font-sans uppercase"
            >
              Demo — eksempelprodukter til butikken kobles til
            </p>
          )}
        </div>

        <div className="border-t border-stroke-dark" />

        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16">
          <ProductGrid products={products} />
        </div>
      </main>
      <Footer />
    </>
  )
}
