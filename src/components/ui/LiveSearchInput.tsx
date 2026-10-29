"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Søkefelt som oppdaterer resultatene mens man skriver (URL-en får ?q=…,
 * siden henter på nytt på serveren). Kort pause etter siste tastetrykk, så
 * vi ikke spør for hver bokstav når man skriver fort. Enter virker fortsatt.
 */
export function LiveSearchInput({
  initial = "",
  placeholder,
  className = "",
  ariaLabel,
  param = "q",
  delay = 250,
}: {
  initial?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  param?: string;
  delay?: number;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const last = useRef(initial.trim());

  useEffect(() => {
    const next = v.trim();
    if (next === last.current) return;
    const t = setTimeout(() => {
      last.current = next;
      const p = new URLSearchParams(sp.toString());
      if (next) p.set(param, next);
      else p.delete(param);
      p.delete("page"); // nytt søk → første side
      const qs = p.toString();
      start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
    }, delay);
    return () => clearTimeout(t);
  }, [v, sp, path, param, delay, router]);

  return (
    <div className={"relative " + className}>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        name={param}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        className="h-10 w-full rounded-lg border border-line-2 bg-canvas pr-9 pl-9 text-sm text-fg outline-none placeholder:text-muted focus:border-fg [@media(pointer:coarse)]:h-11"
      />
      {pending && (
        <span
          aria-hidden
          className="absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-line-2 border-t-fg"
        />
      )}
    </div>
  );
}
