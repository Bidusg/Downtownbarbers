"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * ANMELDELSES-KARUSELL (klient)
 *   Legger kortene (children) i et vannrett spor med snap + sveip, og gir
 *   piler + prikker + rolig auto-fremrykk. Jobber kun på layout/interaksjon –
 *   selve kortene rendres av server-komponenten, så attribusjon/lenker er
 *   uendret. Faller tilbake til vanlig rad uten kontroller når alt får plass.
 *
 *   NB om antall: Google Places-APIet gir maks ~5 anmeldelser per sted (og
 *   TripAdvisor et lite utvalg) – karusellen viser alt vi får, men kan ikke
 *   hente flere enn kildene tilbyr. Koble på TripAdvisor i admin → Rating for
 *   å få flere kort i sporet.
 * ===================================================================== */

export function ReviewsCarousel({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage();
  const items = Children.toArray(children);
  const trackRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const [active, setActive] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const pausedRef = useRef(false);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 4;
    setHasOverflow(overflow);
    const p = overflow ? Math.ceil(el.scrollWidth / el.clientWidth) : 1;
    setPages(Math.max(1, p));
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [measure, items.length]);

  const scrollToPage = useCallback((page: number) => {
    const el = trackRef.current;
    if (!el) return;
    const total = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth));
    const next = ((page % total) + total) % total; // wrap begge veier
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }, []);

  // Rolig auto-fremrykk – står stille ved hover/fokus/sveip og med redusert bevegelse.
  useEffect(() => {
    if (!hasOverflow || pages <= 1) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const el = trackRef.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / el.clientWidth);
      scrollToPage(cur + 1);
    }, 6000);
    return () => window.clearInterval(id);
  }, [hasOverflow, pages, scrollToPage]);

  const pause = () => (pausedRef.current = true);
  const resume = () => (pausedRef.current = false);

  const L = {
    prev: lang === "en" ? "Previous reviews" : "Forrige anmeldelser",
    next: lang === "en" ? "Next reviews" : "Neste anmeldelser",
    goto: (n: number) => (lang === "en" ? `Go to page ${n}` : `Gå til side ${n}`),
  };

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      onTouchStart={pause}
    >
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 sm:gap-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-roledescription={lang === "en" ? "carousel" : "karusell"}
        aria-label={lang === "en" ? "Customer reviews" : "Kundeanmeldelser"}
      >
        {items.map((child, i) => (
          <div
            key={i}
            className="w-[86%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
          >
            {child}
          </div>
        ))}
      </div>

      {hasOverflow && pages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2" role="tablist" aria-label={lang === "en" ? "Review pages" : "Sider med anmeldelser"}>
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={L.goto(i + 1)}
                aria-current={i === active ? "true" : undefined}
                onClick={() => scrollToPage(i)}
                className={`h-2 rounded-full transition-all ${
                  i === active ? "w-6 bg-accent-soft" : "w-2 bg-line-2 hover:bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={L.prev}
              onClick={() => scrollToPage(active - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg transition-colors hover:border-accent-soft hover:text-accent-soft"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={L.next}
              onClick={() => scrollToPage(active + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg transition-colors hover:border-accent-soft hover:text-accent-soft"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
