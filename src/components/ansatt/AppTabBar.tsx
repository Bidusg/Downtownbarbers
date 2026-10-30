"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "@/app/auth-actions";

/**
 * Bunnmeny for ansattdelen på mobil – samme mønster som en vanlig app.
 * Vises bare på små skjermer (PC beholder toppmenyen). «Mer» åpner et ark
 * med resten (fravær, dokumenter, logg ut).
 */

type Tab = { href: string; label: string; icon: IconName; exact?: boolean };

const TABS: Tab[] = [
  { href: "/ansatt", label: "Hjem", icon: "home", exact: true },
  { href: "/ansatt/bookinger", label: "Bookinger", icon: "calendar" },
  { href: "/ansatt/turnus", label: "Turnus", icon: "rota" },
  { href: "/ansatt/timer", label: "Timer", icon: "clock" },
];

const MORE: { href: string; label: string; icon: IconName }[] = [
  { href: "/ansatt/fravaer", label: "Mine fravær", icon: "leave" },
  { href: "/ansatt/dokumenter", label: "Mine dokumenter", icon: "doc" },
];

type IconName = "home" | "calendar" | "rota" | "clock" | "more" | "leave" | "doc" | "logout";

function Icon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) {
  const p = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...p}>
          <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...p}>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h3M8 16.5h6" />
        </svg>
      );
    case "rota":
      return (
        <svg {...p}>
          <rect x="3.5" y="4.5" width="17" height="15.5" rx="2.5" />
          <path d="M3.5 9h17M9 9v11M15 9v11" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "more":
      return (
        <svg {...p}>
          <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" />
          <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
        </svg>
      );
    case "leave":
      return (
        <svg {...p}>
          <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "doc":
      return (
        <svg {...p}>
          <path d="M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
          <path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 16h5" />
        </svg>
      );
    case "logout":
      return (
        <svg {...p}>
          <path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l-4-4 4-4M6 12h9" />
        </svg>
      );
  }
}

const isActive = (path: string, href: string, exact?: boolean) =>
  exact ? path === href : path === href || path.startsWith(href + "/");

export function AppTabBar() {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [pending, start] = useTransition();
  const moreActive = MORE.some((m) => isActive(path, m.href));

  // Lukk arket ved sidebytte og med Escape.
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mer">
          <button
            type="button"
            aria-label="Lukk"
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setMore(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-canvas px-4 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.3)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-2" aria-hidden />
            <ul className="overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_1px_oklch(var(--line))]">
              {MORE.map((m) => (
                <li key={m.href} className="border-b border-line last:border-0">
                  <Link
                    href={m.href}
                    onClick={() => setMore(false)}
                    className={
                      "flex min-h-14 items-center gap-3 px-4 text-[16px] " +
                      (isActive(path, m.href) ? "font-semibold text-fg" : "text-fg")
                    }
                  >
                    <Icon name={m.icon} className="h-5 w-5 text-muted" />
                    {m.label}
                    <span className="ml-auto text-muted" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => signOut())}
              className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 text-[16px] text-danger shadow-[0_0_0_1px_oklch(var(--line))] disabled:opacity-50"
            >
              <Icon name="logout" className="h-5 w-5" />
              {pending ? "Logger ut …" : "Logg ut"}
            </button>
          </div>
        </div>
      )}

      <nav
        aria-label="Ansattmeny"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((t) => {
            const on = isActive(path, t.href, t.exact) && !more;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  onClick={() => setMore(false)}
                  className={
                    "flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors " +
                    (on ? "text-accent-soft" : "text-muted active:text-fg")
                  }
                >
                  <Icon name={t.icon} />
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMore((o) => !o)}
              aria-expanded={more}
              className={
                "flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors " +
                (more || moreActive ? "text-accent-soft" : "text-muted active:text-fg")
              }
            >
              <Icon name="more" />
              Mer
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
