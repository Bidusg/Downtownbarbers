"use client";

import { useEffect, useState } from "react";
import { salon } from "@/lib/data/salon";

const nav = [
  { label: "Tjenester", href: "/#tjenester" },
  { label: "Håndverket", href: "/#handverket" },
  { label: "Galleri", href: "/#galleri" },
  { label: "Team", href: "/#team" },
  { label: "Butikk", href: "/butikk" },
  { label: "Kontakt", href: "/#kontakt" },
];

export function Header({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
        <a href="/#top" className="flex flex-col leading-none">
          <span
            className={
              "font-display text-xl font-bold tracking-tight transition-colors " +
              brand
            }
          >
            {salon.name}
          </span>
          <span className="mt-1 text-[9px] font-semibold tracking-[0.35em] text-accent-soft uppercase">
            {salon.slogan}
          </span>
        </a>

        <nav className="hidden items-center gap-9 md:flex">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={"text-[13px] font-medium transition-colors " + navText}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="/booking"
            className="shine-btn hidden bg-accent-soft px-5 py-2.5 text-[13px] font-semibold text-[#211E1A] transition-transform hover:-translate-y-0.5 sm:inline-block"
          >
            Bestill time
          </a>

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
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-3 text-sm font-medium text-fg last:border-0"
              >
                {n.label}
              </a>
            ))}
            <a
              href="/booking"
              onClick={() => setOpen(false)}
              className="mt-3 bg-accent-soft px-5 py-3 text-center text-sm font-semibold text-[#211E1A]"
            >
              Bestill time
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
