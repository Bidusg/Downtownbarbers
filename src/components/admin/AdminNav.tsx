"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";

type NavItem = { label: string; href: string };
type NavGroup = { label: string; items: NavItem[] };

const dashboard: NavItem = { label: "Dashboard", href: "/admin" };

const groups: NavGroup[] = [
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
      { label: "Rapporter", href: "/admin/rapporter" },
      { label: "Omsetning", href: "/admin/omsetning" },
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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  // Lukk ved navigasjon.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [path]);

  // Lukk dropdown ved klikk utenfor / Escape.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const linkCls = (active: boolean) =>
    "px-3 py-2 text-sm transition-colors " +
    (active ? "font-semibold text-fg" : "text-muted hover:text-fg");

  return (
    <header
      ref={navRef}
      className="sticky top-0 z-30 border-b border-line bg-surface"
    >
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <a href="/admin" className="flex shrink-0 items-baseline gap-2">
          <span className="font-display text-lg font-bold text-fg">Downtown</span>
          <span className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Admin
          </span>
        </a>

        {/* Dropdown-meny (desktop) */}
        <nav className="hidden flex-1 items-center gap-0.5 md:flex">
          <a href={dashboard.href} className={linkCls(isActive(dashboard.href, path))}>
            {dashboard.label}
          </a>
          {groups.map((g) => {
            const groupActive = g.items.some((it) => isActive(it.href, path));
            const isOpen = openMenu === g.label;
            return (
              <div key={g.label} className="relative">
                <button
                  onClick={() => setOpenMenu(isOpen ? null : g.label)}
                  aria-expanded={isOpen}
                  className={
                    "flex items-center gap-1 whitespace-nowrap " +
                    linkCls(groupActive || isOpen)
                  }
                >
                  {g.label}
                  <svg viewBox="0 0 24 24" className={"h-3 w-3 transition-transform " + (isOpen ? "rotate-180" : "")} fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="absolute left-0 top-full z-40 mt-1 min-w-48 border border-line bg-surface py-1 shadow-lg">
                    {g.items.map((it) => (
                      <a
                        key={it.href}
                        href={it.href}
                        className={
                          "block px-4 py-2 text-sm transition-colors " +
                          (isActive(it.href, path)
                            ? "bg-surface-2 font-semibold text-fg"
                            : "text-muted hover:bg-surface-2 hover:text-fg")
                        }
                      >
                        {it.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
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

      {/* Mobilmeny */}
      {mobileOpen && (
        <div className="border-t border-line bg-surface md:hidden">
          <nav className="flex flex-col gap-4 p-4">
            <a
              href={dashboard.href}
              className={
                "px-2 py-2 text-sm " +
                (isActive(dashboard.href, path)
                  ? "bg-surface-2 font-semibold text-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {dashboard.label}
            </a>
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col">
                <p className="px-1 pb-1 text-[9px] font-semibold tracking-[0.25em] text-muted uppercase">
                  {g.label}
                </p>
                {g.items.map((it) => (
                  <a
                    key={it.href}
                    href={it.href}
                    className={
                      "px-2 py-2 text-sm transition-colors " +
                      (isActive(it.href, path)
                        ? "bg-surface-2 font-semibold text-fg"
                        : "text-muted hover:text-fg")
                    }
                  >
                    {it.label}
                  </a>
                ))}
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
