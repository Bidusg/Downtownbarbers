"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Tynn fremdriftslinje øverst ved sidebytte. Starter i det man klikker en
 * intern lenke (før serveren har svart), så klikket føles registrert med en
 * gang – også når neste side bruker et øyeblikk på å laste.
 * Styres direkte på DOM-elementet (ingen re-render av siden).
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const bar = useRef<HTMLDivElement | null>(null);
  const active = useRef(false);
  const timer = useRef<number | null>(null);

  const set = (width: string, opacity: string, transition: string) => {
    const el = bar.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.width = width;
    el.style.opacity = opacity;
  };

  // Ny side er vist → fullfør og skjul linja.
  useEffect(() => {
    if (!active.current) return;
    active.current = false;
    if (timer.current) window.clearTimeout(timer.current);
    set("100%", "1", "width 150ms ease-out");
    timer.current = window.setTimeout(() => set("100%", "0", "opacity 250ms ease"), 150);
  }, [pathname, search]);

  useEffect(() => {
    const start = () => {
      if (timer.current) window.clearTimeout(timer.current);
      active.current = true;
      set("0%", "1", "none");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => set("85%", "1", "width 8s cubic-bezier(0.1, 0.7, 0.2, 1)")),
      );
      // Sikkerhetsnett: linja blir aldri hengende.
      timer.current = window.setTimeout(() => {
        active.current = false;
        set("100%", "0", "opacity 250ms ease");
      }, 12000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || /^(mailto|tel|sms):/i.test(href)) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none inset-x-0 top-0 z-[9999] h-[3px]" style={{ position: "fixed" }}>
      <div ref={bar} className="h-full bg-accent-soft" style={{ width: "0%", opacity: 0 }} />
    </div>
  );
}
