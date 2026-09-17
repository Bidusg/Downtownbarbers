"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/revisor", label: "Oversikt" },
  { href: "/revisor/omsetning", label: "Omsetning" },
  { href: "/revisor/eksport", label: "Eksport (CSV)" },
];

export function RevisorNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-4 text-sm">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <a
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              "transition-colors " +
              (active ? "font-semibold text-fg" : "text-muted hover:text-fg")
            }
          >
            {l.label}
          </a>
        );
      })}
    </nav>
  );
}
