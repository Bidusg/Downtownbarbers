import type { SVGProps } from "react";
import { salon } from "@/lib/data/salon";

/* Merkevare-ikoner (fylte glyffer, arver farge via currentColor). */
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

const socials = [
  { name: "Instagram", href: salon.social.instagram, Icon: InstagramIcon },
  { name: "TikTok", href: salon.social.tiktok, Icon: TikTokIcon },
  { name: "Facebook", href: salon.social.facebook, Icon: FacebookIcon },
];

const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(
  salon.address,
)}&output=embed`;
const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  salon.address,
)}`;

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface-2 text-muted">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-2 md:gap-14">
        {/* Kontakt + sosiale medier */}
        <div className="flex flex-col">
          <p className="font-display text-xl font-bold text-fg">{salon.name}</p>
          <a
            href={mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 text-sm transition-colors hover:text-fg"
          >
            {salon.address}
          </a>
          <a
            href={`tel:${salon.phone.replace(/\s/g, "")}`}
            className="text-sm transition-colors hover:text-fg"
          >
            {salon.phone}
          </a>

          <div className="mt-6 flex gap-3">
            {socials.map(({ name, href, Icon }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${salon.name} på ${name}`}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted transition-all hover:-translate-y-0.5 hover:border-accent-soft hover:text-accent-soft"
              >
                <Icon className="h-[18px] w-[18px]" />
              </a>
            ))}
          </div>

          <ul className="mt-8 space-y-1.5 text-sm">
            {salon.openingHours.map((o) => (
              <li key={o.day} className="flex justify-between gap-6 sm:max-w-xs">
                <span className="text-fg-soft">{o.day}</span>
                <span>{o.hours}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Kart */}
        <div className="overflow-hidden rounded-lg border border-line">
          <iframe
            title={`Kart til ${salon.name}`}
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full min-h-64 w-full border-0"
          />
        </div>
      </div>

      <div className="border-t border-line py-5 text-center text-xs text-muted">
        © {salon.established}–2026 {salon.name}. Alle rettigheter forbeholdt.
      </div>
    </footer>
  );
}
