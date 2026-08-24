"use client";

import { usePathname } from "next/navigation";

const items = [
  { label: "Dashboard", href: "/admin" },
  { label: "Bookinger", href: "/admin/bookinger" },
  { label: "Tjenester", href: "/admin/tjenester" },
  { label: "Ansatte", href: "/admin/ansatte" },
  { label: "Kunder", href: "/admin/kunder" },
  { label: "Regnskap", href: "/admin/regnskap" },
  { label: "Rating", href: "/admin/rating" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
      <div className="border-b border-line px-6 py-5">
        <p className="font-display text-lg font-bold text-fg">Downtown</p>
        <p className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
          Admin
        </p>
      </div>
      <nav className="flex flex-col p-3">
        {items.map((it) => {
          const active =
            it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
          return (
            <a
              key={it.href}
              href={it.href}
              className={
                "px-3 py-2.5 text-sm transition-colors " +
                (active
                  ? "bg-surface-2 font-semibold text-fg"
                  : "text-muted hover:text-fg")
              }
            >
              {it.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
