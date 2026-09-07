"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";

type NavItem = { label: string; href: string };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  { label: "Dashboard", items: [{ label: "Oversikt", href: "/admin" }] },
  {
    label: "Drift",
    items: [
      { label: "Bookinger", href: "/admin/bookinger" },
      { label: "Kasseoppgjør", href: "/admin/kasseoppgjor" },
    ],
  },
  {
    label: "Ansatte",
    items: [
      { label: "Ansatte", href: "/admin/ansatte" },
      { label: "Timelister", href: "/admin/timelister" },
      { label: "Fravær", href: "/admin/fravaer" },
      { label: "Lønn", href: "/admin/lonn" },
    ],
  },
  {
    label: "Salg & marked",
    items: [
      { label: "Tjenester", href: "/admin/tjenester" },
      { label: "Produkter", href: "/admin/produkter" },
      { label: "Gavekort", href: "/admin/gavekort" },
      { label: "Kampanjer", href: "/admin/kampanjer" },
      { label: "Kunder", href: "/admin/kunder" },
      { label: "Oppfølging", href: "/admin/oppfolging" },
    ],
  },
  {
    label: "Økonomi",
    items: [
      { label: "Regnskap", href: "/admin/regnskap" },
      { label: "Budsjett", href: "/admin/budsjett" },
    ],
  },
  {
    label: "Innhold",
    items: [
      { label: "Rating", href: "/admin/rating" },
      { label: "Nettside", href: "/admin/nettside" },
    ],
  },
];

function isActive(href: string, path: string) {
  return href === "/admin" ? path === "/admin" : path.startsWith(href);
}

export function AdminNav({
  email,
  initial,
}: {
  email: string | null;
  initial: string;
}) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeGroup =
    groups.find((g) => g.items.some((it) => isActive(it.href, path))) ??
    groups[0];
  const showSub = activeGroup.items.length > 1;

  // Lukk mobilmenyen ved navigasjon.
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      {/* Rad 1: merke + seksjoner + brukerkontroller */}
      <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
        <a href="/admin" className="flex shrink-0 items-baseline gap-2">
          <span className="font-display text-lg font-bold text-fg">Downtown</span>
          <span className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Admin
          </span>
        </a>

        {/* Seksjoner (desktop) */}
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {groups.map((g) => {
            const active = g === activeGroup;
            return (
              <a
                key={g.label}
                href={g.items[0].href}
                className={
                  "px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "font-semibold text-fg"
                    : "text-muted hover:text-fg")
                }
              >
                {g.label}
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <span className="hidden rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft sm:inline">
            Admin
          </span>
          {email && (
            <span className="hidden text-xs text-muted lg:inline">{email}</span>
          )}
          <div className="flex h-9 w-9 items-center justify-center bg-accent font-display text-sm font-bold text-accent-fg">
            {initial}
          </div>
          <div className="hidden sm:block">
            <LogoutButton />
          </div>
          {/* Hamburger (mobil) */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Meny"
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 items-center justify-center border border-line-2 text-fg md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Rad 2: underpunkter for aktiv seksjon (desktop) */}
      {showSub && (
        <div className="hidden border-t border-line bg-surface-2 md:block">
          <nav className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6">
            {activeGroup.items.map((it) => {
              const active = isActive(it.href, path);
              return (
                <a
                  key={it.href}
                  href={it.href}
                  className={
                    "border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors " +
                    (active
                      ? "border-accent-soft font-semibold text-fg"
                      : "border-transparent text-muted hover:text-fg")
                  }
                >
                  {it.label}
                </a>
              );
            })}
          </nav>
        </div>
      )}

      {/* Mobilmeny */}
      {mobileOpen && (
        <div className="border-t border-line bg-surface md:hidden">
          <nav className="flex flex-col gap-4 p-4">
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col">
                <p className="px-1 pb-1 text-[9px] font-semibold tracking-[0.25em] text-muted uppercase">
                  {g.label}
                </p>
                {g.items.map((it) => {
                  const active = isActive(it.href, path);
                  return (
                    <a
                      key={it.href}
                      href={it.href}
                      className={
                        "px-2 py-2 text-sm transition-colors " +
                        (active
                          ? "bg-surface-2 font-semibold text-fg"
                          : "text-muted hover:text-fg")
                      }
                    >
                      {it.label}
                    </a>
                  );
                })}
              </div>
            ))}
            <div className="border-t border-line pt-3">
              <LogoutButton />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
