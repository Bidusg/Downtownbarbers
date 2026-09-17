"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/admin/CommandPalette";
import {
  adminDashboard,
  adminGroups,
  isAdminNavActive,
} from "@/lib/admin-nav";

function openPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
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
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const navRef = useRef<HTMLElement | null>(null);

  // Lukk ved navigasjon.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [path]);

  // Når mobilmenyen åpnes: kollaps alt bortsett fra gruppen for gjeldende side.
  useEffect(() => {
    if (!mobileOpen) return;
    const current = adminGroups.find((g) =>
      g.items.some((it) => isAdminNavActive(it.href, path)),
    );
    setOpenGroups(current ? [current.label] : []);
  }, [mobileOpen, path]);

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

  function toggleGroup(label: string) {
    setOpenGroups((prev) =>
      prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label],
    );
  }

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
          <a
            href={adminDashboard.href}
            className={linkCls(isAdminNavActive(adminDashboard.href, path))}
          >
            {adminDashboard.label}
          </a>
          {adminGroups.map((g) => {
            const groupActive = g.items.some((it) =>
              isAdminNavActive(it.href, path),
            );
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
                  <div className="absolute left-0 top-full z-40 mt-1 min-w-56 border border-line bg-surface py-1 shadow-lg">
                    {g.items.map((it) => (
                      <a
                        key={it.href}
                        href={it.href}
                        className={
                          "block px-4 py-2 text-sm transition-colors " +
                          (isAdminNavActive(it.href, path)
                            ? "bg-surface-2 font-semibold text-fg"
                            : "text-muted hover:bg-surface-2 hover:text-fg")
                        }
                      >
                        {it.label}
                        {it.description && (
                          <span className="block text-xs font-normal text-muted">
                            {it.description}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          {/* ⌘K-hint / søkeknapp (desktop) */}
          <button
            type="button"
            onClick={openPalette}
            aria-label="Søk i admin (Cmd/Ctrl+K)"
            className="hidden items-center gap-2 rounded-md border border-line-2 px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-fg md:flex"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <span>Søk</span>
            <kbd className="rounded border border-line-2 px-1 py-0.5 text-[10px] font-semibold">
              ⌘K
            </kbd>
          </button>
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

      {/* Mobilmeny (accordion) */}
      {mobileOpen && (
        <div className="border-t border-line bg-surface md:hidden">
          <nav className="flex flex-col gap-1 p-3">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                openPalette();
              }}
              className="mb-1 flex items-center gap-2 rounded-md border border-line-2 px-3 py-2 text-sm text-muted transition-colors hover:text-fg"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              Søk i admin
            </button>
            <a
              href={adminDashboard.href}
              className={
                "rounded-md px-3 py-2 text-sm transition-colors " +
                (isAdminNavActive(adminDashboard.href, path)
                  ? "bg-surface-2 font-semibold text-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {adminDashboard.label}
            </a>
            {adminGroups.map((g) => {
              const isOpen = openGroups.includes(g.label);
              const groupActive = g.items.some((it) =>
                isAdminNavActive(it.href, path),
              );
              return (
                <div key={g.label} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.label)}
                    aria-expanded={isOpen}
                    className={
                      "flex items-center justify-between rounded-md px-3 py-2 text-left text-[11px] font-semibold tracking-[0.15em] uppercase transition-colors " +
                      (groupActive ? "text-fg" : "text-muted hover:text-fg")
                    }
                  >
                    {g.label}
                    <svg viewBox="0 0 24 24" className={"h-3.5 w-3.5 transition-transform " + (isOpen ? "rotate-180" : "")} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col pb-1">
                      {g.items.map((it) => (
                        <a
                          key={it.href}
                          href={it.href}
                          className={
                            "rounded-md px-3 py-2 pl-5 text-sm transition-colors " +
                            (isAdminNavActive(it.href, path)
                              ? "bg-surface-2 font-semibold text-fg"
                              : "text-muted hover:text-fg")
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
            <div className="mt-2 border-t border-line pt-3">
              <LogoutButton />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
