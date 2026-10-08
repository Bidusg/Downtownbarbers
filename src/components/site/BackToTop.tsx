"use client";

import { useEffect, useState } from "react";

/* =====================================================================
 * TIL TOPPEN – flytende knapp nede til høyre (kun mobil).
 *   Dukker opp når man har scrollet et stykke, og tar deg mykt til toppen.
 *   Respekterer «safe area» (iPhone-hjemmeindikator) nederst.
 * ===================================================================== */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Til toppen"
      title="Til toppen"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={
        "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 " +
        "flex h-12 w-12 items-center justify-center rounded-full " +
        "bg-accent-soft text-[#211E1A] shadow-lg ring-1 ring-black/10 " +
        "transition-all duration-300 md:hidden " +
        (show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0")
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
