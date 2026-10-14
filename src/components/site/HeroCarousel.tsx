"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ScaleIn } from "@/components/site/motion/CineFx";

export type Slide =
  | { type: "video"; src: string }
  | { type: "image"; src: string };

/**
 * Hero-bakgrunn som veksler mellom videoer og bilder med jevn crossfade.
 * - Kun nåværende, forrige og neste slide monteres (lazy – sparer båndbredde).
 * - Video spilles fra start når den blir aktiv; går videre når den er ferdig
 *   (med en sikkerhets-cap). Bilder vises noen sekunder med rolig zoom.
 * - Respekterer prefers-reduced-motion: viser da kun ett stillbilde (poster).
 * - Mobil i stående format: hele bildet/videoen vises (object-contain, ingen
 *   zoom), mens en uskarp, mørk kopi av samme bilde fyller resten av skjermen.
 *   Da kuttes ingenting, og heroen fyller fortsatt hele skjermen.
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
  const [portrait, setPortrait] = useState(false);
  const backRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const advancing = useRef(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    setPortrait(m.matches);
    const on = () => setPortrait(m.matches);
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
      for (const v of [videoRefs.current[index], backRefs.current[index]]) {
        if (!v) continue;
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
  }, [index, reduced, n, slides, go, portrait]);

  // Reduced motion: kun ett rolig stillbilde.
  // Stående mobil: hele motivet synlig, uskarp kopi bak.
  const fit = portrait ? "object-contain" : "object-cover";
  const backdrop =
    "absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.55] saturate-[1.15]";

  if (reduced) {
    return (
      <div className="absolute inset-0">
        {portrait && <img src={poster} alt="" aria-hidden className={backdrop} />}
        <div className={portrait ? "absolute inset-x-0 top-[84px] bottom-[36%]" : "absolute inset-0"}>
          <img src={poster} alt="" aria-hidden className={`h-full w-full ${fit}`} />
        </div>
      </div>
    );
  }

  const prev = (index - 1 + n) % n;
  const next = (index + 1) % n;

  return (
    <ScaleIn className="absolute inset-0" from={portrait ? 1 : 1.2} to={portrait ? 1 : 1.04}>
      {/* Basislag: posteren vises alltid bak, så et bilde som ikke laster
          aldri gir en hvit/blank flate – da ser man posteren i stedet. */}
      <img
        src={poster}
        alt=""
        aria-hidden
        className={portrait ? backdrop : "absolute inset-0 h-full w-full object-cover"}
      />
      {slides.map((slide, i) => {
        const live = i === index || i === next || i === prev;
        const active = i === index;
        const style: CSSProperties = {
          transition: "opacity 1.1s ease-in-out",
          opacity: active ? 1 : 0,
        };
        return (
          <div key={i} className="absolute inset-0" style={style}>
            {live && portrait &&
              (slide.type === "video" ? (
                <video
                  ref={(el) => {
                    backRefs.current[i] = el;
                  }}
                  className={backdrop}
                  muted
                  playsInline
                  preload="auto"
                  aria-hidden
                >
                  <source src={slide.src} type="video/mp4" />
                </video>
              ) : failed.has(i) ? null : (
                <img src={slide.src} alt="" aria-hidden className={backdrop} />
              ))}
            {/* Stående mobil: motivet plasseres i feltet mellom menyen og
                teksten/knappen, så ingenting overlapper eller kuttes. */}
            <div className={portrait ? "absolute inset-x-0 top-[84px] bottom-[36%]" : "absolute inset-0"}>
            {live &&
              (slide.type === "video" ? (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  className={`absolute inset-0 h-full w-full ${fit}`}
                  muted
                  playsInline
                  preload="auto"
                  poster={poster}
                  onEnded={go}
                >
                  <source src={slide.src} type="video/mp4" />
                </video>
              ) : failed.has(i) ? null : (
                <img
                  src={slide.src}
                  alt=""
                  aria-hidden
                  onError={() => {
                    setFailed((f) => {
                      const s = new Set(f);
                      s.add(i);
                      return s;
                    });
                    if (active) go();
                  }}
                  className={
                    `absolute inset-0 h-full w-full ${fit}` +
                    (active && !portrait ? " kenburns" : "")
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </ScaleIn>
  );
}
