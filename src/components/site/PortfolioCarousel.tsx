"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * Sveipbar bildekarusell (scroll-snap) med forrige/neste-knapper, teller og
 * piltaster. Ingen bibliotek – nettleserens egen sveip på mobil.
 */
export function PortfolioCarousel({ images, name }: { images: { id: string; url: string; caption: string | null }[]; name: string }) {
  const { t } = useLanguage();
  const track = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const n = Math.max(0, Math.min(images.length - 1, i));
      el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    },
    [images.length],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (!images.length) return null;

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="karusell"
      aria-label={`${t("barber.work")} – ${name}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(idx + 1);
        if (e.key === "ArrowLeft") go(idx - 1);
      }}
    >
      <div
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[28px] bg-surface-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <figure key={img.id} className="relative w-full shrink-0 snap-center" aria-label={`${i + 1} / ${images.length}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.caption || `${t("barber.work")} – ${name} (${i + 1})`}
              className="aspect-[4/5] w-full object-cover sm:aspect-square"
              loading={i < 2 ? "eager" : "lazy"}
              draggable={false}
            />
            {img.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-5 text-sm text-white">
                {img.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(idx - 1)}
            disabled={idx === 0}
            aria-label={t("barber.prev")}
            className="pill-glass absolute top-1/2 left-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-fg shadow-md backdrop-blur transition-opacity disabled:opacity-0"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go(idx + 1)}
            disabled={idx === images.length - 1}
            aria-label={t("barber.next")}
            className="pill-glass absolute top-1/2 right-3 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-fg shadow-md backdrop-blur transition-opacity disabled:opacity-0"
          >
            ›
          </button>
          <div className="mt-4 flex items-center justify-center gap-3">
            <div className="flex gap-1.5" aria-hidden>
              {images.map((img, i) => (
                <span
                  key={img.id}
                  className={"h-1.5 rounded-full transition-all " + (i === idx ? "w-5 bg-fg" : "w-1.5 bg-line-2")}
                />
              ))}
            </div>
            <span className="text-xs text-muted tabular-nums" aria-live="polite">
              {idx + 1} / {images.length}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
