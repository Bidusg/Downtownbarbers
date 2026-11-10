"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import type { ReportMeta } from "@/lib/reports/registry";

/* Rapportsenter: velg rapporter + periode, last ned ÉN Excel-fil. */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Dagens dato i Oslo. */
function osloToday() {
  const now = new Date();
  const g = (o: Intl.DateTimeFormatOptions) =>
    Number(now.toLocaleString("en-US", { timeZone: "Europe/Oslo", ...o }));
  return { y: g({ year: "numeric" }), m: g({ month: "numeric" }), d: g({ day: "numeric" }) };
}

type Preset = { key: string; label: string; from: string; to: string };

function presets(): Preset[] {
  const { y, m, d } = osloToday();
  const pm = m === 1 ? 12 : m - 1;
  const pmY = m === 1 ? y - 1 : y;
  return [
    { key: "mnd", label: "Denne måneden", from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) },
    { key: "forrige", label: "Forrige måned", from: iso(pmY, pm, 1), to: iso(pmY, pm, lastDay(pmY, pm)) },
    { key: "ar", label: "Hittil i år", from: iso(y, 1, 1), to: iso(y, m, d) },
    { key: "ifjor", label: "I fjor", from: iso(y - 1, 1, 1), to: iso(y - 1, 12, 31) },
  ];
}

// Umiddelbar trykk-respons; ingen bevegelse ved redusert bevegelse.
const PRESS =
  "transition-[transform,background-color,border-color,opacity] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

export function ReportCenter({ reports, from, to }: { reports: ReportMeta[]; from: string; to: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState({ from, to });
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quick = useMemo(() => presets(), []);
  const matched = quick.find((p) => p.from === range.from && p.to === range.to)?.key ?? null;
  const showCustom = custom || matched === null;

  const groups = useMemo(() => {
    const map = new Map<string, ReportMeta[]>();
    for (const r of reports) map.set(r.category, [...(map.get(r.category) ?? []), r]);
    return [...map.entries()];
  }, [reports]);

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const setMany = (keys: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });

  const allKeys = reports.map((r) => r.key);
  const count = selected.size;
  const canDownload = count > 0 && !!range.from && !!range.to;
  // Behold rekkefølgen fra registeret
  const href = `/admin/rapporter/excel?r=${allKeys.filter((k) => selected.has(k)).join(",")}&from=${range.from}&to=${range.to}`;

  async function download() {
    if (busy || !canDownload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href, { credentials: "same-origin" });
      if (!res.ok) {
        const text = (await res.text().catch(() => "")).trim();
        throw new Error(text && text.length < 300 && !text.startsWith("<") ? text : `Noe gikk galt (feil ${res.status}).`);
      }
      const blob = await res.blob();
      const m = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = m?.[1] ?? "downtownbarbers-rapport.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Kunne ikke lage rapporten. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  }

  const pill = (active: boolean) =>
    `rounded-full border px-3.5 py-2 text-sm font-medium [@media(pointer:coarse)]:min-h-11 ${PRESS} ` +
    (active
      ? "border-accent-soft bg-accent-soft/10 text-fg"
      : "border-line-2 text-muted hover:bg-surface-2 hover:text-fg");

  const linkBtn = `text-xs font-semibold text-muted underline-offset-2 hover:text-fg hover:underline [@media(pointer:coarse)]:py-2 ${PRESS}`;

  return (
    <Card>
      <div className="space-y-6">
        {/* Periode */}
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg">Periode</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Periode">
            {quick.map((p) => {
              const active = !showCustom && matched === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={active}
                  className={pill(active)}
                  onClick={() => {
                    setRange({ from: p.from, to: p.to });
                    setCustom(false);
                  }}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={showCustom}
              className={pill(showCustom)}
              onClick={() => setCustom(true)}
            >
              Egendefinert
            </button>
          </div>
          {showCustom && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Fra" htmlFor="rc-from">
                <Input
                  id="rc-from"
                  type="date"
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              </Field>
              <Field label="Til" htmlFor="rc-to">
                <Input
                  id="rc-to"
                  type="date"
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Rapporter */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-fg">Rapporter</p>
            <div className="flex gap-4">
              <button type="button" className={linkBtn} onClick={() => setMany(allKeys, true)}>
                Velg alle
              </button>
              <button type="button" className={linkBtn} onClick={() => setMany(allKeys, false)}>
                Fjern alle
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {groups.map(([cat, list]) => {
              const keys = list.map((r) => r.key);
              const allOn = keys.every((k) => selected.has(k));
              return (
                <section key={cat} aria-label={cat}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{cat}</h3>
                    <button type="button" className={linkBtn} onClick={() => setMany(keys, !allOn)}>
                      {allOn ? "Fjern alle" : "Velg alle"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {list.map((r) => {
                      const on = selected.has(r.key);
                      return (
                        <label
                          key={r.key}
                          className={
                            `flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 [@media(pointer:coarse)]:min-h-14 ${PRESS} ` +
                            (on ? "border-accent-soft bg-accent-soft/10" : "border-line-2 hover:bg-surface-2")
                          }
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(r.key)}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-[#f47721]"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-fg">{r.title}</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted">{r.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Handling */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-sm text-muted" aria-live="polite">
            {count === 0 ? "Ingen rapporter valgt" : `${count} ${count === 1 ? "rapport" : "rapporter"} valgt`}
          </p>
          <button
            type="button"
            onClick={download}
            disabled={!canDownload || busy}
            aria-busy={busy}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 [@media(pointer:coarse)]:min-h-11 ${PRESS}`}
          >
            {!busy && (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {busy ? "Lager rapport…" : "Last ned Excel"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
