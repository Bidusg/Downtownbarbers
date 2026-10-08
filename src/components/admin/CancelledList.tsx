"use client";

import { useMemo, useState } from "react";
import type { CancelledBooking } from "@/lib/cancelled-queries";
import { EmptyState } from "@/components/ui/EmptyState";

/* =====================================================================
 * AVBESTILLINGER – liste med filter (Alle / Kunden / Oss).
 *   Viser når timen var, hvem kunden var, barber + tjeneste, når den ble
 *   booket, og når/hvem som avbestilte. Historiske rader (før stemplingen
 *   ble slått på) viser «– (ukjent)» for når/hvem.
 * ===================================================================== */

type Filter = "all" | "customer" | "staff";

const dt = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const d = new Intl.DateTimeFormat("nb-NO", {
  timeZone: "Europe/Oslo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function fmtDateTime(iso: string | null): string {
  if (!iso) return "–";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "–" : dt.format(t);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "–";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "–" : d.format(t);
}

function WhoBadge({ by }: { by: CancelledBooking["cancelledBy"] }) {
  if (by === "customer")
    return (
      <span className="inline-flex items-center rounded-full bg-accent-soft/15 px-2 py-0.5 text-[11px] font-semibold text-accent-soft">
        Kunden
      </span>
    );
  if (by === "staff")
    return (
      <span className="inline-flex items-center rounded-full bg-fg/10 px-2 py-0.5 text-[11px] font-semibold text-fg">
        Oss
      </span>
    );
  return <span className="text-[11px] text-muted">– ukjent</span>;
}

export function CancelledList({ items }: { items: CancelledBooking[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: items.length,
      customer: items.filter((i) => i.cancelledBy === "customer").length,
      staff: items.filter((i) => i.cancelledBy === "staff").length,
    }),
    [items],
  );

  const shown = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter((i) => i.cancelledBy === filter),
    [items, filter],
  );

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "Alle", n: counts.all },
    { key: "customer", label: "Avbestilt av kunden", n: counts.customer },
    { key: "staff", label: "Avbestilt av oss", n: counts.staff },
  ];

  if (items.length === 0) {
    return (
      <EmptyState description="Ingen avbestilte timer enda. Når en kunde eller dere avbestiller en time, dukker den opp her." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors " +
              (filter === t.key
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-surface text-muted hover:border-accent-soft hover:text-fg")
            }
          >
            {t.label}
            <span className="ml-1.5 opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {/* Desktop: tabell */}
      <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-[11px] tracking-wide text-muted uppercase">
              <th className="px-4 py-2.5 font-semibold">Time</th>
              <th className="px-4 py-2.5 font-semibold">Kunde</th>
              <th className="px-4 py-2.5 font-semibold">Barber</th>
              <th className="px-4 py-2.5 font-semibold">Tjeneste</th>
              <th className="px-4 py-2.5 font-semibold">Avbestilt</th>
              <th className="px-4 py-2.5 font-semibold">Av</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((b) => (
              <tr key={b.id} className="bg-surface">
                <td className="px-4 py-3 whitespace-nowrap text-fg">
                  {fmtDateTime(b.startAt)}
                </td>
                <td className="px-4 py-3 text-fg">{b.customer ?? "–"}</td>
                <td className="px-4 py-3 text-muted">{b.barber ?? "–"}</td>
                <td className="px-4 py-3 text-muted">{b.service ?? "–"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {fmtDateTime(b.cancelledAt)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <WhoBadge by={b.cancelledBy} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobil: kort */}
      <div className="space-y-3 md:hidden">
        {shown.map((b) => (
          <div key={b.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-fg">{b.customer ?? "–"}</p>
                <p className="text-xs text-muted">
                  {b.service ?? "–"}
                  {b.barber ? ` · ${b.barber}` : ""}
                </p>
              </div>
              <WhoBadge by={b.cancelledBy} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Time</dt>
                <dd className="text-fg">{fmtDateTime(b.startAt)}</dd>
              </div>
              <div>
                <dt className="text-muted">Avbestilt</dt>
                <dd className="text-fg">{fmtDateTime(b.cancelledAt)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        Viser {shown.length} av {items.length} avbestilte timer. «Booket»-dato og
        «hvem avbestilte» registreres automatisk fra og med at stemplingen ble
        slått på – eldre avbestillinger står som «ukjent».
      </p>
    </div>
  );
}
