"use client";

import { useEffect, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/site/LogoMark";
import { salon } from "@/lib/data/salon";

function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
  );
}

const nav = [
  { label: "Tjenester", href: "/#tjenester" },
  { label: "Håndverket", href: "/#handverket" },
  { label: "Galleri", href: "/#galleri" },
  { label: "Team", href: "/#team" },
  { label: "Butikk", href: "/butikk" },
  { label: "Kontakt", href: "/#kontakt" },
];

export function Header({
  overlay = false,
  phone = salon.phone,
  address = salon.address,
}: {
  overlay?: boolean;
  phone?: string;
  address?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const telHref = `tel:${phone.replace(/\s/g, "")}`;
  const shortAddress = address.split(",")[0];
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  // overlay=false (vanlige sider): alltid solid, i flyt (sticky).
  // overlay=true (forsiden): gjennomsiktig over hero, solid ved scroll (fixed).
  const solid = !overlay || scrolled || open;
  // Logofarge: hvit over hero, text-fg (temaavhengig) på solid bar.
  const brand = solid ? "text-fg" : "text-white";
  const navText = solid
    ? "text-muted hover:text-fg"
    : "text-white/75 hover:text-white";
  const bar = solid ? "bg-fg" : "bg-white";

  return (
    <header
      className={
        (overlay ? "fixed" : "sticky") +
        " inset-x-0 top-0 z-40 transition-colors duration-500 " +
        (solid
          ? "border-b border-line bg-canvas/85 backdrop-blur"
          : "border-b border-transparent bg-transparent")
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/#top" aria-label="Downtown Barbers – til toppen">
          <LogoMark className={"h-11 transition-colors " + brand} />
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={"text-[13px] font-medium transition-colors " + navText}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className={
              "hidden items-center gap-1.5 text-[13px] font-medium transition-colors lg:inline-flex " +
              navText
            }
          >
            <PinIcon className="h-4 w-4" />
            {shortAddress}
          </a>
          <a
            href={telHref}
            aria-label={`Ring Downtown Barbers på ${phone}`}
            className={
              "inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors " +
              navText
            }
          >
            <PhoneIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{phone}</span>
          </a>
          <Link
            href="/booking"
            className="shine-btn hidden bg-accent-soft px-5 py-2.5 text-[13px] font-semibold text-[#211E1A] transition-transform hover:-translate-y-0.5 sm:inline-block"
          >
            Bestill time
          </Link>

          {/* Hamburger – kun mobil */}
          <button
            type="button"
            aria-label={open ? "Lukk meny" : "Åpne meny"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          >
            <span
              className={
                "block h-0.5 w-6 transition-transform " +
                bar +
                (open ? " translate-y-2 rotate-45" : "")
              }
            />
            <span
              className={
                "block h-0.5 w-6 transition-opacity " +
                bar +
                (open ? " opacity-0" : "")
              }
            />
            <span
              className={
                "block h-0.5 w-6 transition-transform " +
                bar +
                (open ? " -translate-y-2 -rotate-45" : "")
              }
            />
          </button>
        </div>
      </div>

      {/* Mobilmeny */}
      {open && (
        <nav className="border-t border-line bg-canvas px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-3 text-sm font-medium text-fg last:border-0"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/booking"
              onClick={() => setOpen(false)}
              className="mt-3 bg-accent-soft px-5 py-3 text-center text-sm font-semibold text-[#211E1A]"
            >
              Bestill time
            </Link>
            <a
              href={telHref}
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center gap-2 text-sm font-medium text-fg"
            >
              <PhoneIcon className="h-4 w-4 text-accent-soft" />
              {phone}
            </a>
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center gap-2 text-sm font-medium text-fg"
            >
              <PinIcon className="h-4 w-4 text-accent-soft" />
              {address}
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
