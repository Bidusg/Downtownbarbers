"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type Slide =
  | { type: "video"; src: string }
  | { type: "image"; src: string };

/**
 * Hero-bakgrunn som veksler mellom videoer og bilder med jevn crossfade.
 * - Kun nåværende, forrige og neste slide monteres (lazy – sparer båndbredde).
 * - Video spilles fra start når den blir aktiv; går videre når den er ferdig
 *   (med en sikkerhets-cap). Bilder vises noen sekunder med rolig zoom.
 * - Respekterer prefers-reduced-motion: viser da kun ett stillbilde (poster).
 */
export function HeroCarousel({
  slides,
  poster,
}: {
  slides: Slide[];
  poster: string;
}) {
  const n = slides.length;
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const advancing = useRef(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);

  const go = useCallback(() => {
    if (advancing.current) return;
    advancing.current = true;
    setIndex((i) => (i + 1) % n);
  }, [n]);

  useEffect(() => {
    advancing.current = false;
    if (reduced || n <= 1) return;
    const slide = slides[index];
    let timer: ReturnType<typeof setTimeout>;

    if (slide.type === "image") {
      timer = setTimeout(go, 5200);
    } else {
      const v = videoRefs.current[index];
      if (v) {
        try {
          v.currentTime = 0;
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {
          /* noop */
        }
      }
      // Sikkerhetsnett hvis «ended» ikke fyrer (lange klipp cappes).
      timer = setTimeout(go, 9000);
    }
    return () => clearTimeout(timer);
  }, [index, reduced, n, slides, go]);

  // Reduced motion: kun ett rolig stillbilde.
  if (reduced) {
    return (
      <img
        src={poster}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  const prev = (index - 1 + n) % n;
  const next = (index + 1) % n;

  return (
    <div className="absolute inset-0">
      {slides.map((slide, i) => {
        const live = i === index || i === next || i === prev;
        const active = i === index;
        const style: CSSProperties = {
          transition: "opacity 1.1s ease-in-out",
          opacity: active ? 1 : 0,
        };
        return (
          <div key={i} className="absolute inset-0" style={style}>
            {live &&
              (slide.type === "video" ? (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="auto"
                  poster={poster}
                  onEnded={go}
                >
                  <source src={slide.src} type="video/mp4" />
                </video>
              ) : (
                <img
                  src={slide.src}
                  alt=""
                  aria-hidden
                  className={
                    "h-full w-full object-cover" + (active ? " kenburns" : "")
                  }
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
