"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Vannrett rad som kan sveipes (barbere, datoer). I stedet for at siste
 * element blir hardt kuttet i kanten, tones kanten ut der det er mer å se,
 * og på PC/iPad vises ‹ › -piler som blar raden.
 */
export function ScrollRow({
  children,
  className = "",
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
  className?: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdge((p) => (p.l === l && p.r === r ? p : { l, r }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver kaller update én gang med en gang (og ved ny bredde).
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    // Nye elementer (f.eks. datoer som lastes inn) → sjekk kantene på nytt.
    const mo = new MutationObserver(() => {
      for (const c of Array.from(el.children)) ro.observe(c);
      update();
    });
    mo.observe(el, { childList: true });
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      mo.disconnect();
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  const go = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.75), behavior: "smooth" });
  };

  const fade = 40;
  const mask = `linear-gradient(to right, transparent 0, #000 ${edge.l ? fade : 0}px, #000 calc(100% - ${
    edge.r ? fade : 0
  }px), transparent 100%)`;

  const arrow =
    "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-canvas text-lg text-fg shadow-[0_1px_3px_rgb(0_0_0/0.15),0_0_0_1px_oklch(var(--line))] transition-opacity hover:shadow-[0_1px_3px_rgb(0_0_0/0.2),0_0_0_1px_oklch(var(--line-2))] sm:flex";

  return (
    <div className="relative">
      <div
        ref={ref}
        className={"snap-row " + className}
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      >
        {children}
      </div>
      {edge.l && (
        <button type="button" onClick={() => go(-1)} aria-label={prevLabel} className={arrow + " -left-3"}>
          ‹
        </button>
      )}
      {edge.r && (
        <button type="button" onClick={() => go(1)} aria-label={nextLabel} className={arrow + " -right-3"}>
          ›
        </button>
      )}
    </div>
  );
}
