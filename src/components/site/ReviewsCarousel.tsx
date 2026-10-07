"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * ANMELDELSES-KARUSELL (klient)
 *   Viser ETT anmeldelses-kort om gangen, sentrert, og bytter automatisk
 *   (med piler + prikker). Roterer uansett antall – også med bare 2–3
 *   anmeldelser, der et vanlig rutenett ellers bare ville stått stille.
 *   Står i ro ved hover/fokus/sveip og med «redusert bevegelse».
 * ===================================================================== */

export function ReviewsCarousel({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage();
  const items = Children.toArray(children);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const pausedRef = useRef(false);
  const count = items.length;

  const goTo = useCallback(
    (page: number) => {
      const el = trackRef.current;
      if (!el || count === 0) return;
      const next = ((page % count) + count) % count; // wrap begge veier
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [count],
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () =>
      setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Rolig auto-rotasjon – av ved hover/fokus/sveip og med redusert bevegelse.
  useEffect(() => {
    if (count <= 1) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      const el = trackRef.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      goTo(cur + 1);
    }, 5000);
    return () => window.clearInterval(id);
  }, [count, goTo]);

  const pause = () => (pausedRef.current = true);
  const resume = () => (pausedRef.current = false);

  const L = {
    prev: lang === "en" ? "Previous review" : "Forrige anmeldelse",
    next: lang === "en" ? "Next review" : "Neste anmeldelse",
    goto: (n: number) => (lang === "en" ? `Go to review ${n}` : `Gå til anmeldelse ${n}`),
    label: lang === "en" ? "Customer reviews" : "Kundeanmeldelser",
    roledesc: lang === "en" ? "carousel" : "karusell",
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
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-roledescription={L.roledesc}
        aria-label={L.label}
      >
        {items.map((child, i) => (
          <div
            key={i}
            className="flex w-full shrink-0 snap-center justify-center px-1"
          >
            <div className="w-full max-w-xl">{child}</div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label={L.prev}
            onClick={() => goTo(active - 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg transition-colors hover:border-accent-soft hover:text-accent-soft"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex items-center gap-2" role="tablist" aria-label={L.label}>
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={L.goto(i + 1)}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all ${
                  i === active ? "w-6 bg-accent-soft" : "w-2 bg-line-2 hover:bg-muted"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label={L.next}
            onClick={() => goTo(active + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-fg transition-colors hover:border-accent-soft hover:text-accent-soft"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
