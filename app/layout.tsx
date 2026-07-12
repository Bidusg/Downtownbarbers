import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Downtown Barbers | Oslo',
  description:
    'Der presisjon møter stil. Freshe klipper, skarpe fades og ekspert grooming — midt i hjertet av Oslo.',
  keywords: ['barbershop', 'oslo', 'hårklipp', 'fade', 'skjegg', 'grooming'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
