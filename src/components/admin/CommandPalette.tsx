"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminPages, type AdminPage } from "@/lib/admin-nav";

/** Event navet (⌘K-hintet) sender for å åpne paletten. */
export const OPEN_COMMAND_PALETTE_EVENT = "admin:open-command-palette";

function matches(page: AdminPage, q: string): boolean {
  if (!q) return true;
  const haystack = `${page.label} ${page.group} ${page.description ?? ""}`.toLowerCase();
  // Alle søkeordene må finnes (enkel fuzzy pr. ord).
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const results = useMemo(
    () => adminPages.filter((p) => matches(p, query)),
    [query],
  );

  // Åpne med Cmd/Ctrl+K, og via event fra ⌘K-hintet.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  // Fokus + nullstill ved åpning, lås body-scroll mens åpen.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Hold aktivt valg innenfor gyldig område når resultatlisten endres.
  useEffect(() => {
    setActive((a) => (results.length === 0 ? 0 : Math.min(a, results.length - 1)));
  }, [results.length]);

  // Rull aktivt element inn i visning.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function go(page: AdminPage | undefined) {
    if (!page) return;
    setOpen(false);
    router.push(page.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) =>
        results.length ? (a - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Søk i admin"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Søk i admin-sidene…"
            aria-label="Søk i admin-sidene"
            aria-controls="command-palette-list"
            className="h-12 w-full bg-transparent text-sm text-fg outline-none focus:outline-none focus-visible:outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-line-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline">
            Esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="max-h-[50vh] overflow-y-auto py-2"
        >
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted">
              Ingen treff på «{query}»
            </li>
          ) : (
            results.map((p, i) => (
              <li key={p.href} data-index={i} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => go(p)}
                  onMouseMove={() => setActive(i)}
                  className={
                    "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors " +
                    (i === active ? "bg-surface-2" : "hover:bg-surface-2")
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">
                      {p.label}
                    </span>
                    {p.description && (
                      <span className="block truncate text-xs text-muted">
                        {p.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
                    {p.group}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span>↑↓ naviger</span>
          <span>↵ åpne</span>
          <span>esc lukk</span>
        </div>
      </div>
    </div>
  );
}
