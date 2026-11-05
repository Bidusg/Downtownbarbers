"use client";

import { useState } from "react";

/**
 * Velg ansatte og skriv ut samlet lønnsrapport (PDF) for måneden.
 * «Alle» gir samleoversikt + én side per ansatt; én ansatt gir bare hans side.
 */
export function SalaryReportPicker({
  year,
  month,
  monthLabel,
  staff,
}: {
  year: number;
  month: number;
  monthLabel: string;
  staff: { id: string; name: string; title: string | null }[];
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(staff.map((s) => s.id)));
  const all = picked.size === staff.length && staff.length > 0;

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const href =
    `/admin/lonn/rapport?year=${year}&month=${month}&staff=` +
    (all ? "all" : [...picked].join(","));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Lønnsrapport {monthLabel} {year}</h2>
          <p className="mt-1 text-sm text-muted">
            Velg ansatte og skriv ut én samlet PDF – samleoversikt først, deretter én side per ansatt
            med grunnlønn, tillegg, overtid, provisjon, brutto, skattetrekk og netto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicked(all ? new Set() : new Set(staff.map((s) => s.id)))}
            className="rounded-lg border border-line-2 px-3 py-2 text-sm text-fg hover:border-accent-soft"
          >
            {all ? "Fjern alle" : "Velg alle"}
          </button>
          <a
            href={picked.size ? href : undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={picked.size === 0}
            className={
              "inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover " +
              (picked.size === 0 ? "pointer-events-none opacity-40" : "")
            }
          >
            Skriv ut ({picked.size}) PDF
          </a>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2">
            <input
              id={`lr-${s.id}`}
              type="checkbox"
              checked={picked.has(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 accent-[oklch(var(--accent))]"
            />
            <label htmlFor={`lr-${s.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="block truncate text-sm font-medium text-fg">{s.name}</span>
              <span className="block truncate text-xs text-muted">{s.title ?? "Barber"}</span>
            </label>
            <a
              href={`/revisor/ansatte/${s.id}?year=${year}&month=${month}`}
              className="shrink-0 text-xs font-semibold text-accent-soft hover:underline"
            >
              Lønnsdata
            </a>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        «Lønnsdata» åpner lønnssiden for den ansatte, der du legger inn overtid, helligdag,
        arbeidede timer, korreksjon, skattetrekk, kontonummer og andre tillegg/trekk for måneden.
      </p>
    </div>
  );
}
