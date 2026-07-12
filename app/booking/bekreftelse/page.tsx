import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Betaling bekreftet | Downtown Barbers',
  description: 'Betalingen din er registrert hos Downtown Barbers.',
}

/**
 * Landing page after a Vipps payment (returnUrl in real mode, redirect
 * target in mock mode). Kept intentionally free of booking details —
 * the reference in the URL is only echoed for support purposes.
 */
export default function PaymentConfirmationPage({
  searchParams,
}: {
  searchParams: { ref?: string; demo?: string }
}) {
  const isDemo = searchParams.demo === '1'

  return (
    <>
      <Navbar />
      <main className="bg-ink min-h-screen">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-36 pb-24">
          <div className="max-w-lg mx-auto text-center py-12">
            <div className="w-14 h-14 bg-forest/20 border border-forest mx-auto flex items-center justify-center mb-6">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5L9.5 17L19 7"
                  stroke="#3D8A69"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="font-display text-3xl text-cream mb-3">
              Betaling bekreftet
            </h1>
            <p className="text-muted font-sans text-sm leading-relaxed max-w-sm mx-auto">
              Takk! Betalingen er registrert. Vi sees hos Downtown Barbers.
            </p>

            {searchParams.ref && (
              <p className="text-muted/50 font-sans text-[10px] tracking-wide mt-4">
                Referanse: {searchParams.ref}
              </p>
            )}

            {isDemo && (
              <p
                role="status"
                className="inline-block mt-6 px-3 py-1.5 border border-stroke-dark text-muted text-[10px] tracking-[0.2em] font-sans uppercase"
              >
                Demo — simulert betaling
              </p>
            )}

            <div className="mt-10">
              <a
                href="/"
                className="inline-block px-6 py-2.5 border border-stroke-dark text-cream/70 text-xs font-sans tracking-[0.16em] uppercase hover:border-forest/50 hover:text-cream transition-colors duration-200"
              >
                Tilbake til forsiden
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
