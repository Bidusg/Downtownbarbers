"use client";

/* =====================================================================
 * CineFx — cinematic scroll-motor for de offentlige sidene.
 *   • SmoothScroll : Lenis treghets-scroll synket med GSAP ScrollTrigger.
 *   • Parallax     : flytter et (overdimensjonert) element mot scroll.
 *   • SplitReveal  : kinetisk tittel – ord stiger opp fra maske, stagger.
 *   • FadeUp       : mykt løft + fade når elementet treffer viewporten.
 *   • Hairline     : accent-strek som tegner seg inn.
 *   • ScaleIn      : media som zoomer rolig inn mens man scroller forbi.
 *
 * Alt respekterer prefers-reduced-motion (da vises alt ferdig, uten bevegelse)
 * og rydder opp etter seg (ScrollTrigger.kill) ved unmount.
 * ===================================================================== */

import {
  useEffect,
  useRef,
  type ElementType,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

let registered = false;
function ensureGsap() {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
}
function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Lenis treghets-scroll + GSAP-ticker. Wrapper hele siden. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (prefersReduced()) return;
    ensureGsap();
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.3,
    });
    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);
    const onRaf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onRaf);
    gsap.ticker.lagSmoothing(0);
    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(onRaf);
      lenis.off("scroll", onScroll);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}

/** Parallax: flytter innholdet vertikalt mens seksjonen passerer viewporten.
 *  Legg et oversized media (f.eks. h-[120%]) inni for ekte dybde. */
export function Parallax({
  children,
  amount = 14,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  /** hvor mange prosent elementet forskyves (±). */
  amount?: number;
  className?: string;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    ensureGsap();
    const tween = gsap.fromTo(
      el,
      { yPercent: -amount },
      {
        yPercent: amount,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [amount]);
  const Comp = Tag as ElementType;
  return (
    <Comp ref={ref as never} className={className}>
      {children}
    </Comp>
  );
}

/** Kinetisk tittel: splitter teksten i ord som stiger opp fra en maske. */
export function SplitReveal({
  text,
  as: Tag = "h2",
  className = "",
  start = "top 82%",
  stagger = 0.075,
  duration = 1,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  start?: string;
  stagger?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ensureGsap();
    const words = el.querySelectorAll<HTMLElement>(".split-word");
    if (prefersReduced()) {
      gsap.set(words, { yPercent: 0, opacity: 1 });
      return;
    }
    const tween = gsap.fromTo(
      words,
      { yPercent: 115, opacity: 0 },
      {
        yPercent: 0,
        opacity: 1,
        duration,
        ease: "power4.out",
        stagger,
        scrollTrigger: { trigger: el, start },
      },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [text, start, stagger, duration]);

  const Comp = Tag as ElementType;
  const words = text.split(" ");
  return (
    <Comp ref={ref as never} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="split-mask" aria-hidden>
          <span className="split-word">{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Comp>
  );
}

/** Mykt løft + fade (med valgfri blur) når elementet treffer viewporten. */
export function FadeUp({
  children,
  className = "",
  y = 42,
  delay = 0,
  blur = false,
  as: Tag = "div",
  start = "top 88%",
  id,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  blur?: boolean;
  as?: ElementType;
  start?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ensureGsap();
    if (prefersReduced()) {
      gsap.set(el, { opacity: 1, y: 0, filter: "none" });
      return;
    }
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y, filter: blur ? "blur(12px)" : "none" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 1.1,
        delay,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start },
      },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [y, delay, blur, start]);
  const Comp = Tag as ElementType;
  return (
    <Comp ref={ref as never} id={id} className={className} style={{ opacity: 0 }}>
      {children}
    </Comp>
  );
}

/** Accent-hårlinje som tegner seg inn fra midten. */
export function Hairline({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ensureGsap();
    if (prefersReduced()) {
      gsap.set(el, { scaleX: 1 });
      return;
    }
    const tween = gsap.to(el, {
      scaleX: 1,
      duration: 1.4,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 92%" },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);
  return <div ref={ref} className={"hairline " + className} />;
}

/** Media som zoomer rolig (scrub) mens seksjonen passerer – ken-burns på scroll. */
export function ScaleIn({
  children,
  className = "",
  from = 1.18,
  to = 1,
}: {
  children: ReactNode;
  className?: string;
  from?: number;
  to?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    ensureGsap();
    const tween = gsap.fromTo(
      el,
      { scale: from },
      {
        scale: to,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [from, to]);
  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
