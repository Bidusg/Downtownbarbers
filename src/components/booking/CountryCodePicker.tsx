"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Flags from "country-flag-icons/react/3x2";

/* =====================================================================
 * Landskode-velger med ekte flagg (SVG – vises likt på Windows, Mac og
 * mobil; emoji-flagg vises ikke på Windows). Søk på land eller kode.
 * ===================================================================== */

// [ISO-kode, retningsnummer] – vanligste først, resten alfabetisk i lista.
const COUNTRIES: [string, string][] = [
  ["NO", "+47"], ["SE", "+46"], ["DK", "+45"], ["FI", "+358"], ["IS", "+354"],
  ["GB", "+44"], ["DE", "+49"], ["PL", "+48"], ["LT", "+370"], ["LV", "+371"],
  ["EE", "+372"], ["NL", "+31"], ["BE", "+32"], ["FR", "+33"], ["ES", "+34"],
  ["PT", "+351"], ["IT", "+39"], ["GR", "+30"], ["IE", "+353"], ["CH", "+41"],
  ["AT", "+43"], ["CZ", "+420"], ["HU", "+36"], ["RO", "+40"], ["BG", "+359"],
  ["HR", "+385"], ["RS", "+381"], ["BA", "+387"], ["UA", "+380"], ["TR", "+90"],
  ["US", "+1"], ["CA", "+1"], ["BR", "+55"], ["AU", "+61"], ["NZ", "+64"],
  ["ET", "+251"], ["ER", "+291"], ["SO", "+252"], ["KE", "+254"], ["NG", "+234"],
  ["GH", "+233"], ["ZA", "+27"], ["EG", "+20"], ["MA", "+212"], ["TN", "+216"],
  ["DZ", "+213"], ["SD", "+249"], ["IQ", "+964"], ["SY", "+963"], ["IR", "+98"],
  ["AF", "+93"], ["PK", "+92"], ["IN", "+91"], ["LK", "+94"], ["BD", "+880"],
  ["AE", "+971"], ["SA", "+966"], ["LB", "+961"], ["PS", "+970"], ["IL", "+972"],
  ["CN", "+86"], ["JP", "+81"], ["KR", "+82"], ["VN", "+84"], ["TH", "+66"],
  ["PH", "+63"], ["ID", "+62"], ["MY", "+60"], ["CL", "+56"], ["CO", "+57"],
  ["MX", "+52"], ["AR", "+54"],
];

type FlagCmp = (p: { className?: string; title?: string }) => React.ReactElement;
function Flag({ iso, className = "" }: { iso: string; className?: string }) {
  const C = (Flags as unknown as Record<string, FlagCmp>)[iso];
  return C ? (
    <C className={`inline-block h-[14px] w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${className}`} />
  ) : (
    <span className={`inline-block h-[14px] w-[21px] shrink-0 rounded-[2px] bg-line ${className}`} />
  );
}

export function CountryCodePicker({
  value,
  onChange,
  locale = "nb",
  ariaLabel,
}: {
  value: string; // retningsnummer, f.eks. "+47"
  onChange: (code: string) => void;
  locale?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Hvilket land er valgt (retningsnummer kan deles, f.eks. +1 US/CA).
  const [iso, setIso] = useState(() => COUNTRIES.find(([, c]) => c === value)?.[0] ?? "NO");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale.startsWith("en") ? "en" : "nb"], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const nameOf = (c: string) => names?.of(c) ?? c;

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = COUNTRIES.filter(([c, code]) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return nameOf(c).toLowerCase().includes(s) || code.includes(s.replace(/^\+?/, "+")) || c.toLowerCase() === s;
  });

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-full items-center gap-2 border border-line-2 bg-canvas px-2.5 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
      >
        <Flag iso={iso} />
        <span className="tabular-nums">{value}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-surface shadow-2xl">
          <div className="border-b border-line p-2">
            <input
              ref={search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={locale.startsWith("en") ? "Search country or code" : "Søk land eller kode"}
              className="w-full border border-line-2 bg-canvas px-2.5 py-2 text-sm text-fg outline-none focus:border-accent-soft"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {list.length === 0 && <li className="px-3 py-2 text-sm text-muted">—</li>}
            {list.map(([c, code]) => {
              const active = c === iso;
              return (
                <li key={c}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setIso(c);
                      onChange(code);
                      setOpen(false);
                      setQ("");
                    }}
                    className={
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent-soft/10 " +
                      (active ? "bg-accent-soft/15 font-semibold text-fg" : "text-fg")
                    }
                  >
                    <Flag iso={c} />
                    <span className="min-w-0 flex-1 truncate">{nameOf(c)}</span>
                    <span className="text-muted tabular-nums">{code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
