"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";

const links = [
  { href: "/kasse", label: "Dashboard", exact: true },
  { href: "/kasse/kalender", label: "Kalender" },
  { href: "/kasse/kunder", label: "Kunder" },
  { href: "/kasse/lager", label: "Lager" },
  { href: "/kasse/gavekort", label: "Gavekort" },
  { href: "/kasse/stempling", label: "Stempling" },
];

export function KasseTopbar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden items-baseline gap-2 sm:flex">
          <span className="font-display text-lg font-bold text-fg">Downtown</span>
          <span className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Kasse
          </span>
        </div>
        <nav className="flex items-center gap-1 text-[13px] sm:gap-4">
          {links.map((l) => {
            const active = l.exact
              ? pathname === l.href
              : pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={
                  "px-2 py-1 font-medium transition-colors " +
                  (active
                    ? "font-semibold text-fg"
                    : "text-muted hover:text-fg")
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <LogoutButton />
    </header>
  );
}
