"use client";

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

type Variant = "up" | "left" | "right" | "scale" | "blur";

/**
 * Avslører barn med en myk animasjon når de scrolles inn i visning.
 * Bruker IntersectionObserver, og respekterer prefers-reduced-motion
 * (CSS slår animasjonen helt av – da vises innholdet umiddelbart).
 */
export function Reveal({
  children,
  as = "div",
  variant = "up",
  delay = 0,
  className = "",
  style,
  once = true,
  id,
}: {
  children: ReactNode;
  as?: ElementType;
  variant?: Variant;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  once?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.unobserve(e.target);
          } else if (!once) {
            setShown(false);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  return createElement(
    as,
    {
      ref,
      id,
      className: `reveal${shown ? " is-visible" : ""}${className ? " " + className : ""}`,
      "data-variant": variant,
      style: { ...style, ["--reveal-delay" as string]: `${delay}ms` },
    },
    children,
  );
}
