"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

type Props = {
  /** 0–100 */
  value: number;
  label?: string;
  /** Tekst til høyre (f.eks. "78 %" eller "14 / 20"). Utelates for ren bar. */
  caption?: string;
  className?: string;
};

/**
 * Fremdriftsbar (0–100 %). Merkevare: skarpe hjørner, #F47721 (accent-soft) som
 * gradient-fyll med et rolig skinn-sveip. Fyllet animeres fra 0 til verdien når
 * baren mountes. Brukes for shop-dagsmål og ansatt-månedsmål.
 */
export function ProgressBar({ value, label, caption, className }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  // Start på 0 og voks til verdien etter mount (fin «fyll»-animasjon).
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div className={cn("w-full", className)}>
      {(label || caption) && (
        <div className="mb-1.5 flex items-baseline justify-between">
          {label && <span className="text-sm text-fg">{label}</span>}
          {caption && (
            <span className="font-display text-sm text-muted">{caption}</span>
          )}
        </div>
      )}
      <div
        className="h-2.5 w-full overflow-hidden bg-surface-2"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="bo-bar-fill h-full transition-[width] duration-[900ms] ease-out"
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}
