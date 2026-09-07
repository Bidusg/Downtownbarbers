"use client";

import { usePathname } from "next/navigation";

type Item = { label: string; href: string };
type Group = { heading?: string; items: Item[] };

const groups: Group[] = [
  { items: [{ label: "Dashboard", href: "/admin" }] },
  {
    heading: "Drift",
    items: [
      { label: "Bookinger", href: "/admin/bookinger" },
      { label: "Kasseoppgjør", href: "/admin/kasseoppgjor" },
    ],
  },
  {
    heading: "Ansatte",
    items: [
      { label: "Ansatte", href: "/admin/ansatte" },
      { label: "Timelister", href: "/admin/timelister" },
      { label: "Fravær", href: "/admin/fravaer" },
      { label: "Lønn", href: "/admin/lonn" },
    ],
  },
  {
    heading: "Salg & marked",
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
    heading: "Økonomi",
    items: [
      { label: "Regnskap", href: "/admin/regnskap" },
      { label: "Budsjett", href: "/admin/budsjett" },
    ],
  },
  {
    heading: "Innhold",
    items: [
      { label: "Rating", href: "/admin/rating" },
      { label: "Nettside", href: "/admin/nettside" },
    ],
  },
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
      <nav className="flex flex-col gap-4 p-3">
        {groups.map((g, gi) => (
          <div key={g.heading ?? gi} className="flex flex-col">
            {g.heading && (
              <p className="px-3 pt-1 pb-1.5 text-[9px] font-semibold tracking-[0.25em] text-muted uppercase">
                {g.heading}
              </p>
            )}
            {g.items.map((it) => {
              const active =
                it.href === "/admin"
                  ? path === "/admin"
                  : path.startsWith(it.href);
              return (
                <a
                  key={it.href}
                  href={it.href}
                  className={
                    "px-3 py-2 text-sm transition-colors " +
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
      </nav>
    </aside>
  );
}
