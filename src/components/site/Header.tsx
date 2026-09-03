"use client";

import { useState } from "react";
import { salon } from "@/lib/data/salon";

const nav = [
  { label: "Tjenester", href: "/#tjenester" },
  { label: "Team", href: "/#team" },
  { label: "Butikk", href: "/butikk" },
  { label: "Kontakt", href: "/#kontakt" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="/#top" className="flex flex-col leading-none">
          <span className="font-display text-xl font-bold tracking-tight text-fg">
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
              className="text-[13px] font-medium text-muted transition-colors hover:text-fg"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="/booking"
            className="hidden bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover sm:inline-block"
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
                "block h-0.5 w-6 bg-fg transition-transform " +
                (open ? "translate-y-2 rotate-45" : "")
              }
            />
            <span
              className={
                "block h-0.5 w-6 bg-fg transition-opacity " +
                (open ? "opacity-0" : "")
              }
            />
            <span
              className={
                "block h-0.5 w-6 bg-fg transition-transform " +
                (open ? "-translate-y-2 -rotate-45" : "")
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
              className="mt-3 bg-accent px-5 py-3 text-center text-sm font-semibold text-accent-fg"
            >
              Bestill time
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}
