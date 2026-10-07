"use client";

import { useState, useTransition } from "react";
import { setSectionVisible } from "@/app/admin/nettside/actions";
import { SITE_SECTIONS, type SectionFlags } from "@/lib/site-sections-config";

/* =====================================================================
 * AV/PÅ PER SEKSJON (admin → Nettside)
 *   Skru en seksjon av → den forsvinner fra forsiden OG fra navbar.
 *   Lagres med én gang du trykker på bryteren.
 * ===================================================================== */

export function SectionVisibilityManager({ flags }: { flags: SectionFlags }) {
  const [state, setState] = useState<SectionFlags>(flags);
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function toggle(key: string, next: boolean) {
    setErr(null);
    setBusyKey(key);
    setState((s) => ({ ...s, [key]: next })); // optimistisk
    start(async () => {
      const res = await setSectionVisible(key, next);
      if (res?.error) {
        setErr(res.error);
        setState((s) => ({ ...s, [key]: !next })); // rull tilbake
      }
      setBusyKey(null);
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold">Seksjoner (vis / skjul)</h2>
        <p className="text-sm text-muted">
          Skru av en seksjon, så forsvinner den fra forsiden og fra menyen med en
          gang. Skru den på igjen når du vil ha den tilbake.
        </p>
      </div>

      {err && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {err}
        </p>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {SITE_SECTIONS.map((s) => {
          const on = state[s.key] !== false;
          return (
            <li key={s.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{s.label}</span>
                <span className="text-xs text-muted">{on ? "Vises" : "Skjult"}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${on ? "Skjul" : "Vis"} ${s.label}`}
                disabled={pending && busyKey === s.key}
                onClick={() => toggle(s.key, !on)}
                className={
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 " +
                  (on ? "bg-accent" : "bg-line-2")
                }
              >
                <span
                  className={
                    "absolute top-1 h-5 w-5 rounded-full bg-white transition-all " +
                    (on ? "left-6" : "left-1")
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
