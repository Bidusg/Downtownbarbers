"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Spiller en myk enter-animasjon hver gang ruten endres. Vi bytter en `key`
 * på wrapperen (basert på pathname) slik at CSS-animasjonen .bo-page kjøres
 * på nytt. Respekterer prefers-reduced-motion via CSS.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const first = useRef(true);
  const [key, setKey] = useState(path);

  useEffect(() => {
    // Ikke re-animer på aller første render (unngår dobbel animasjon med SSR).
    if (first.current) {
      first.current = false;
      return;
    }
    setKey(path);
  }, [path]);

  return (
    <div key={key} className="bo-page">
      {children}
    </div>
  );
}
