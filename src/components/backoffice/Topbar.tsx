"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/admin/CommandPalette";

/* =====================================================================
 * Delt back-office-topbar for admin / revisor / ansatt / kasse.
 *
 *   - Flat modus: enkel rad med lenker + glidende understrek-indikator.
 *   - Gruppert modus (admin): topp-nivå-grupper med animert mega-dropdown,
 *     glidende pill under aktiv/hover-gruppe, ⌘K-søk og brukermeny.
 *
 * Ingen eksterne animasjonsbibliotek – ren CSS (.bo-* i globals.css) + en
 * liten måle-hook for den glidende indikatoren. Alt respekterer
 * prefers-reduced-motion.
 * ===================================================================== */

export type BoLink = {
  href: string;
  label: string;
  description?: string;
  exact?: boolean;
};
export type BoGroup = { label: string; items: BoLink[] };
export type BoNav =
  | { kind: "flat"; links: BoLink[] }
  | { kind: "grouped"; dashboard: BoLink; groups: BoGroup[] };

function isActive(href: string, exact: boolean, path: string): boolean {
  return exact ? path === href : path === href || path.startsWith(href + "/");
}

/* ---------- Ikoner (inline, animerbare) ---------- */
function Icon({ name, className }: { name: string; className?: string }) {
  const p = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "dashboard":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "drift":
      return (
        <svg {...p}>
          <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.7-6.7-1.4 1.4M7.7 16.3l-1.4 1.4m12 0-1.4-1.4M7.7 7.7 6.3 6.3" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      );
    case "ansatte":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-2.3-4.5" />
        </svg>
      );
    case "butikk":
      return (
        <svg {...p}>
          <path d="M4 8h16l-1 4.5a3 3 0 0 1-3 2.4H8a3 3 0 0 1-3-2.4L4 8Z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
          <path d="M6 15v4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
        </svg>
      );
    case "kunder":
      return (
        <svg {...p}>
          <path d="M20.8 4.6a4.5 4.5 0 0 0-6.4 0L12 7l-2.4-2.4a4.5 4.5 0 1 0-6.4 6.4L12 20l8.8-8.9a4.5 4.5 0 0 0 0-6.5Z" />
        </svg>
      );
    case "okonomi":
      return (
        <svg {...p}>
          <path d="M4 19V5m0 14h16M8 15l3-4 3 2 4-6" />
        </svg>
      );
    case "innhold":
      return (
        <svg {...p}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...p}>
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

const GROUP_ICON: Record<string, string> = {
  Drift: "drift",
  Ansatte: "ansatte",
  "Butikk & lager": "butikk",
  "Kunder & marked": "kunder",
  Økonomi: "okonomi",
  Innhold: "innhold",
};

/* ---------- Glidende indikator (måler barn i en rail) ----------
 * `signal` er en verdi som endres når layouten kan ha endret seg (path,
 * antall lenker) slik at vi måler på nytt. */
function useRail(targetKey: string | null, signal: string) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ ["--pill-o" as string]: 0 });

  useLayoutEffect(() => {
    // `signal` endres når layouten kan ha endret seg (path / antall lenker),
    // og tvinger en ny måling selv om targetKey er den samme.
    void signal;
    const measure = () => {
      const rail = railRef.current;
      const el =
        rail && targetKey
          ? rail.querySelector<HTMLElement>(
              `[data-rail-key="${CSS.escape(targetKey)}"]`,
            )
          : null;
      if (!el) {
        setStyle({ ["--pill-o" as string]: 0 });
        return;
      }
      setStyle({
        ["--pill-x" as string]: `${el.offsetLeft}px`,
        ["--pill-w" as string]: `${el.offsetWidth}px`,
        ["--pill-o" as string]: 1,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [targetKey, signal]);

  return { railRef, style };
}

/* ---------- Flat nav (revisor/ansatt/kasse) ---------- */
function FlatNav({ links, path }: { links: BoLink[]; path: string }) {
  const activeKey =
    links.find((l) => isActive(l.href, l.exact ?? false, path))?.href ?? null;
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const { railRef, style } = useRail(
    hoverKey ?? activeKey,
    `${path}|${links.length}`,
  );

  return (
    <div
      ref={railRef}
      className="bo-navrail relative flex items-center gap-1 sm:gap-2"
      onMouseLeave={() => setHoverKey(null)}
    >
      <span className="bo-underline" style={style} aria-hidden />
      {links.map((l) => {
        const active = isActive(l.href, l.exact ?? false, path);
        return (
          <Link
            key={l.href}
            href={l.href}
            data-rail-key={l.href}
            onMouseEnter={() => setHoverKey(l.href)}
            onFocus={() => setHoverKey(l.href)}
            onBlur={() => setHoverKey(null)}
            aria-current={active ? "page" : undefined}
            className={
              "bo-navbtn relative rounded-md px-2.5 py-1.5 text-[13px] font-medium sm:px-3 " +
              (active ? "text-fg" : "text-muted hover:text-fg")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------- Gruppert nav med mega-dropdown (admin) ---------- */
function GroupedNav({
  dashboard,
  groups,
  path,
  onNavigate,
}: {
  dashboard: BoLink;
  groups: BoGroup[];
  path: string;
  onNavigate?: () => void;
}) {
  const dashActive = isActive(dashboard.href, true, path);
  const activeGroupIdx = groups.findIndex((g) =>
    g.items.some((it) => isActive(it.href, it.exact ?? false, path)),
  );
  const activeKey = dashActive
    ? dashboard.href
    : activeGroupIdx >= 0
      ? `g${activeGroupIdx}`
      : null;

  const [open, setOpen] = useState<number | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const { railRef, style } = useRail(
    hoverKey ?? activeKey,
    `${path}|${groups.length}`,
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    setHoverKey(null);
  }, []);

  // Escape + klikk utenfor lukker.
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  return (
    <div
      ref={wrapRef}
      className="relative hidden lg:block"
      onMouseLeave={close}
    >
      <div ref={railRef} className="bo-navrail relative flex items-center gap-1">
        <span className="bo-pill" style={style} aria-hidden />

        <Link
          href={dashboard.href}
          data-rail-key={dashboard.href}
          onMouseEnter={() => {
            setHoverKey(dashboard.href);
            setOpen(null);
          }}
          onClick={onNavigate}
          className={
            "bo-navbtn relative z-10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " +
            (dashActive ? "text-fg" : "text-muted hover:text-fg")
          }
        >
          <Icon name="dashboard" className="h-4 w-4 text-accent-soft" />
          {dashboard.label}
        </Link>

        {groups.map((g, i) => {
          const isOpen = open === i;
          const groupActive = i === activeGroupIdx;
          return (
            <button
              key={g.label}
              type="button"
              data-rail-key={`g${i}`}
              aria-expanded={isOpen}
              onMouseEnter={() => {
                setHoverKey(`g${i}`);
                setOpen(i);
              }}
              onFocus={() => setHoverKey(`g${i}`)}
              onClick={() => setOpen(isOpen ? null : i)}
              className={
                "bo-navbtn relative z-10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " +
                (isOpen || groupActive ? "text-fg" : "text-muted hover:text-fg")
              }
            >
              <Icon
                name={GROUP_ICON[g.label] ?? "innhold"}
                className="h-4 w-4 text-accent-soft"
              />
              {g.label}
              <svg
                viewBox="0 0 24 24"
                className={
                  "h-3.5 w-3.5 transition-transform duration-300 " +
                  (isOpen ? "rotate-180" : "")
                }
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>

      {open !== null && (
        <div
          key={open}
          className="bo-mega absolute left-0 top-full z-40 mt-2 w-[min(52rem,80vw)] overflow-hidden rounded-2xl border border-line-2 bg-surface p-2"
          role="menu"
        >
          <div className="mb-1 flex items-center gap-2 px-3 pt-2">
            <Icon
              name={GROUP_ICON[groups[open].label] ?? "innhold"}
              className="h-4 w-4 text-accent-soft"
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
              {groups[open].label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1">
            {groups[open].items.map((it, idx) => {
              const active = isActive(it.href, it.exact ?? false, path);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  role="menuitem"
                  onClick={() => {
                    close();
                    onNavigate?.();
                  }}
                  style={{ ["--i" as string]: idx }}
                  className={
                    "bo-mega-item group flex items-start gap-3 rounded-xl px-3 py-2.5 " +
                    (active
                      ? "bg-accent-soft/12 ring-1 ring-accent-soft/30"
                      : "hover:bg-surface-2")
                  }
                >
                  <span
                    className={
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors " +
                      (active
                        ? "bg-accent-soft"
                        : "bg-line-2 group-hover:bg-accent-soft")
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          "truncate text-sm font-semibold " +
                          (active ? "text-fg" : "text-fg-soft")
                        }
                      >
                        {it.label}
                      </span>
                      <Icon
                        name="arrow"
                        className="bo-arrow h-3.5 w-3.5 text-accent-soft"
                      />
                    </span>
                    {it.description && (
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {it.description}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Mobil fullskjerm-meny ---------- */
function MobileSheet({
  nav,
  path,
  onClose,
}: {
  nav: BoNav;
  path: string;
  onClose: () => void;
}) {
  const rows: BoLink[] =
    nav.kind === "flat"
      ? nav.links
      : [nav.dashboard, ...nav.groups.flatMap((g) => g.items)];

  let counter = 0;

  return (
    <div
      className="bo-sheet fixed inset-0 z-50 lg:hidden"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="bo-sheet-panel absolute inset-x-0 top-0 max-h-[92vh] overflow-y-auto rounded-b-3xl border-b border-line-2 bg-surface p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between px-1 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            Meny
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk meny"
            className="text-2xl leading-none text-muted hover:text-fg"
          >
            ×
          </button>
        </div>

        {nav.kind === "flat" ? (
          <nav className="flex flex-col gap-1">
            {rows.map((l) => {
              const active = isActive(l.href, l.exact ?? false, path);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onClose}
                  style={{ ["--i" as string]: counter++ }}
                  className={
                    "bo-sheet-row rounded-xl px-3 py-2.5 text-sm font-medium " +
                    (active
                      ? "bg-accent-soft/12 text-fg ring-1 ring-accent-soft/30"
                      : "text-muted hover:bg-surface-2 hover:text-fg")
                  }
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <nav className="flex flex-col gap-4">
            <Link
              href={nav.dashboard.href}
              onClick={onClose}
              style={{ ["--i" as string]: counter++ }}
              className={
                "bo-sheet-row flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold " +
                (isActive(nav.dashboard.href, true, path)
                  ? "bg-accent-soft/12 text-fg ring-1 ring-accent-soft/30"
                  : "text-fg-soft hover:bg-surface-2")
              }
            >
              <Icon name="dashboard" className="h-4 w-4 text-accent-soft" />
              {nav.dashboard.label}
            </Link>
            {nav.groups.map((g) => (
              <div key={g.label}>
                <p className="mb-1 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted/80">
                  <Icon
                    name={GROUP_ICON[g.label] ?? "innhold"}
                    className="h-3.5 w-3.5 text-accent-soft"
                  />
                  {g.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {g.items.map((it) => {
                    const active = isActive(it.href, it.exact ?? false, path);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={onClose}
                        style={{ ["--i" as string]: counter++ }}
                        className={
                          "bo-sheet-row rounded-lg px-3 py-2 text-sm " +
                          (active
                            ? "bg-accent-soft/12 font-semibold text-fg"
                            : "text-muted hover:bg-surface-2 hover:text-fg")
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
        )}

        <div className="mt-5 border-t border-line pt-4">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

/* ---------- Topbar ---------- */
export function Topbar({
  role,
  homeHref,
  nav,
  search = false,
  badge,
  email,
  initial,
}: {
  role: string;
  homeHref: string;
  nav: BoNav;
  search?: boolean;
  badge?: string | null;
  email?: string | null;
  initial?: string;
}) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobilmenyen lukkes når man trykker en lenke (hver rad kaller onClose) eller
  // på bakteppet – ingen effekt nødvendig (unngår kaskade-renders).

  const openPalette = () =>
    window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));

  const brand = (
    <Link href={homeHref} className="bo-badge flex shrink-0 items-baseline gap-2">
      <span className="font-display text-lg font-bold text-fg">Downtown</span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-accent-soft">
        {role}
      </span>
    </Link>
  );

  return (
    <>
      <header className="bo-topbar sticky top-0 z-40" data-scrolled={scrolled}>
        <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          {brand}

          {/* Desktop-nav */}
          {nav.kind === "grouped" ? (
            <div className="hidden flex-1 lg:flex">
              <GroupedNav
                dashboard={nav.dashboard}
                groups={nav.groups}
                path={path}
              />
            </div>
          ) : (
            <div className="hidden flex-1 lg:flex">
              <FlatNav links={nav.links} path={path} />
            </div>
          )}

          {/* For flat-nav på nettbrett vises den også på mindre skjerm. */}
          {nav.kind === "flat" && (
            <div className="hidden flex-1 md:flex lg:hidden">
              <FlatNav links={nav.links} path={path} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {badge && (
              <span className="hidden rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft sm:inline">
                {badge}
              </span>
            )}

            {search && (
              <button
                type="button"
                onClick={openPalette}
                aria-label="Søk (Cmd/Ctrl+K)"
                className="bo-search hidden items-center gap-2 rounded-lg border border-line-2 px-3 py-2 text-xs text-muted transition-all hover:text-fg lg:flex"
              >
                <Icon name="search" className="h-3.5 w-3.5" />
                <span>Søk</span>
                <kbd className="ml-1 rounded border border-line-2 px-1 py-0.5 text-[10px] font-semibold">
                  ⌘K
                </kbd>
              </button>
            )}

            {search && (
              <button
                type="button"
                onClick={openPalette}
                aria-label="Søk"
                className="bo-search flex h-9 w-9 items-center justify-center rounded-lg border border-line-2 text-muted hover:text-fg lg:hidden"
              >
                <Icon name="search" className="h-4 w-4" />
              </button>
            )}

            {initial && (
              <div className="bo-avatar hidden h-9 w-9 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accent-fg sm:flex" title={email ?? role}>
                {initial}
              </div>
            )}

            <div className="hidden sm:block">
              <LogoutButton />
            </div>

            {/* Hamburger (mobil/nettbrett for gruppert; mobil for flat) */}
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Lukk meny" : "Åpne meny"}
              aria-expanded={mobileOpen}
              className={
                "bo-burger flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg " +
                (nav.kind === "grouped" ? "lg:hidden" : "md:hidden")
              }
            >
              <span
                className={
                  "block h-0.5 w-6 bg-fg " +
                  (mobileOpen ? "translate-y-2 rotate-45" : "")
                }
              />
              <span
                className={
                  "block h-0.5 w-6 bg-fg " + (mobileOpen ? "opacity-0" : "")
                }
              />
              <span
                className={
                  "block h-0.5 w-6 bg-fg " +
                  (mobileOpen ? "-translate-y-2 -rotate-45" : "")
                }
              />
            </button>
          </div>

          <span className="bo-accent-line" aria-hidden />
        </div>
      </header>

      {mobileOpen && (
        <MobileSheet nav={nav} path={path} onClose={() => setMobileOpen(false)} />
      )}
    </>
  );
}
