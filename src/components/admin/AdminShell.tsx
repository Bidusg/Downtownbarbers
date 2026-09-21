"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

/** Selve navigasjonen (delt mellom desktop-sidebar og mobil-skuff). */
function NavLinks({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const itemCls = (active: boolean) =>
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors " +
    (active
      ? "bg-accent-soft/15 font-semibold text-fg"
      : "text-muted hover:bg-surface-2 hover:text-fg");

  return (
    <nav className="flex flex-col gap-5">
      <Link
        href={adminDashboard.href}
        onClick={onNavigate}
        className={itemCls(isAdminNavActive(adminDashboard.href, path))}
      >
        {adminDashboard.label}
      </Link>
      {adminGroups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[10px] font-semibold tracking-[0.2em] text-muted/70 uppercase">
            {g.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isAdminNavActive(it.href, path);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={onNavigate}
                  className={
                    itemCls(active) +
                    (active
                      ? " border-l-2 border-accent-soft"
                      : " border-l-2 border-transparent")
                  }
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Admin-skall med venstre sidebar (desktop) og mobil-skuff. Erstatter den gamle
 * horisontale dropdown-baren – lettere å skanne 28 sider, alltid synlig
 * kontekst. ⌘K-søket (CommandPalette) beholdes.
 */
export function AdminShell({
  email,
  initial,
  children,
}: {
  email: string | null;
  initial: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Skuffen lukkes når man trykker en lenke (onNavigate) eller på bakteppet –
  // ingen effekt nødvendig.

  const brand = (
    <Link href="/admin" className="flex shrink-0 items-baseline gap-2">
      <span className="font-display text-lg font-bold text-fg">Downtown</span>
      <span className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
        Admin
      </span>
    </Link>
  );

  const searchButton = (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Søk i admin (Cmd/Ctrl+K)"
      className="flex w-full items-center gap-2 rounded-md border border-line-2 px-3 py-2 text-xs text-muted transition-colors hover:text-fg"
    >
      <SearchIcon className="h-3.5 w-3.5" />
      <span>Søk</span>
      <kbd className="ml-auto rounded border border-line-2 px-1 py-0.5 text-[10px] font-semibold">
        ⌘K
      </kbd>
    </button>
  );

  const userFooter = (
    <div className="flex items-center gap-2 border-t border-line px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center bg-accent font-display text-sm font-bold text-accent-fg">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted">{email ?? "Admin"}</p>
      </div>
      <LogoutButton />
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas text-fg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-line px-4">
          {brand}
        </div>
        <div className="border-b border-line p-3">{searchButton}</div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks path={path} />
        </div>
        {userFooter}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface px-4 lg:hidden">
        {brand}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openPalette}
            aria-label="Søk i admin"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line-2 text-muted hover:text-fg"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Lukk meny" : "Åpne meny"}
            aria-expanded={mobileOpen}
            className="flex h-9 w-9 flex-col items-center justify-center gap-1.5"
          >
            <span className={"block h-0.5 w-6 bg-fg transition-transform " + (mobileOpen ? "translate-y-2 rotate-45" : "")} />
            <span className={"block h-0.5 w-6 bg-fg transition-opacity " + (mobileOpen ? "opacity-0" : "")} />
            <span className={"block h-0.5 w-6 bg-fg transition-transform " + (mobileOpen ? "-translate-y-2 -rotate-45" : "")} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              {brand}
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Lukk meny"
                className="text-2xl leading-none text-muted hover:text-fg"
              >
                ×
              </button>
            </div>
            <div className="border-b border-line p-3">{searchButton}</div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks path={path} onNavigate={() => setMobileOpen(false)} />
            </div>
            {userFooter}
          </div>
        </div>
      )}

      {/* Innhold */}
      <div className="lg:pl-64">
        <main className="px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
