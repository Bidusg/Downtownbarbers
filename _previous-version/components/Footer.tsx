import Link from 'next/link'

const navLinks = [
  { label: 'Hjem', href: '#hjem' },
  { label: 'Om oss', href: '#om-oss' },
  { label: 'Tjenester', href: '#tjenester' },
  { label: 'Team', href: '#team' },
  { label: 'Butikk', href: '#butikk' },
  { label: 'Ledige stillinger', href: '#jobb' },
]

const social = [
  { label: 'TikTok', href: 'https://tiktok.com/@downtownbarbersoslo' },
  { label: 'Facebook', href: 'https://facebook.com/downtownbarbersoslo' },
  { label: 'Instagram', href: 'https://instagram.com/downtownbarbersoslo' },
]

export default function Footer() {
  return (
    <footer className="bg-canvas border-t border-line">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-14 pb-10">
        <div className="grid md:grid-cols-3 gap-10 mb-12">
          {/* Brand */}
          <div>
            <p className="font-display text-fg text-[9px] tracking-[0.38em] font-light mb-0.5">
              DOWNTOWN
            </p>
            <p className="font-display text-fg text-[26px] tracking-[0.18em] font-bold leading-tight">
              BARBERS
            </p>
            <p className="text-muted text-[11px] font-sans mt-2.5 leading-snug">
              Osterhaus&apos; gate 10<br />
              0183 Oslo
            </p>
            <a
              href="tel:+4746358764"
              className="mt-3 block text-muted text-[11px] font-sans hover:text-fg transition-colors duration-200"
            >
              +47 463 58 764
            </a>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-2.5" aria-label="Footer navigasjon">
            <p className="text-muted text-[9px] tracking-[0.3em] font-sans mb-1">NAVIGASJON</p>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted/70 hover:text-fg text-[11px] tracking-[0.15em] font-sans transition-colors duration-200 self-start"
              >
                {link.label.toUpperCase()}
              </Link>
            ))}
          </nav>

          {/* Social */}
          <div>
            <p className="text-muted text-[9px] tracking-[0.3em] font-sans mb-3.5">FØLG OSS</p>
            <div className="flex flex-col gap-2.5">
              {social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted/70 hover:text-fg text-[11px] tracking-[0.15em] font-sans transition-colors duration-200 self-start inline-flex items-center gap-2"
                >
                  {s.label.toUpperCase()}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-40">
                    <path d="M1 9L9 1M9 1H3M9 1v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-muted/60 text-[10px] font-sans tracking-[0.05em]">
            © 2025 Downtown Barbers. Alle rettigheter forbeholdt.
          </p>
          <p className="text-line text-[10px] font-sans tracking-[0.2em]">
            OSLO · SIDEN 2013
          </p>
        </div>
      </div>
    </footer>
  )
}
