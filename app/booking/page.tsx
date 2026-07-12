import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import BookingWizard from '@/components/booking/BookingWizard'

export const metadata: Metadata = {
  title: 'Book time | Downtown Barbers',
  description: 'Book din time hos Downtown Barbers i Oslo.',
}

export default function BookingPage() {
  return (
    <>
      <Navbar />
      <main className="bg-canvas min-h-screen">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-36 pb-16">
          <p className="text-muted text-[9px] tracking-[0.35em] font-sans mb-6">BOOKING</p>
          <h1
            className="font-display text-fg leading-[0.88] tracking-tight mb-4"
            style={{ fontSize: 'clamp(44px, 6vw, 96px)' }}
          >
            Book din
            <span className="block font-normal italic text-fg/85">time.</span>
          </h1>
          <p className="text-muted font-sans text-[15px] leading-relaxed max-w-[48ch] mt-6">
            Velg tjeneste, barber og tidspunkt. Bekreftelse sendes på e-post.
          </p>
        </div>

        <div className="border-t border-line" />

        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16">
          <div className="max-w-xl">
            <BookingWizard />
          </div>
        </div>

        <div className="border-t border-line">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-12 grid sm:grid-cols-3 gap-8">
            <div>
              <p className="text-accent-soft text-[9px] tracking-[0.3em] font-sans mb-3">ADRESSE</p>
              <p className="text-fg font-sans text-sm">Osterhaus&apos; gate 10, 0183 Oslo</p>
            </div>
            <div>
              <p className="text-accent-soft text-[9px] tracking-[0.3em] font-sans mb-3">ÅPNINGSTIDER</p>
              <p className="text-fg font-sans text-sm">Man–lør 09:00 – 19:00</p>
              <p className="text-muted font-sans text-sm">Søndag stengt</p>
            </div>
            <div>
              <p className="text-accent-soft text-[9px] tracking-[0.3em] font-sans mb-3">TELEFON</p>
              <a href="tel:+4746358764" className="text-fg font-sans text-sm hover:text-accent-soft transition-colors">
                +47 463 58 764
              </a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
