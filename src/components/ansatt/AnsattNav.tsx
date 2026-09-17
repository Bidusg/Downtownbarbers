"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/ansatt", label: "Min side", exact: true },
  { href: "/ansatt/turnus", label: "Min turnus" },
  { href: "/ansatt/fravaer", label: "Mine fravær" },
  { href: "/ansatt/timer", label: "Mine timer" },
];

export function AnsattNav() {
  const pathname = usePathname();
  return (
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
              (active ? "font-semibold text-fg" : "text-muted hover:text-fg")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
