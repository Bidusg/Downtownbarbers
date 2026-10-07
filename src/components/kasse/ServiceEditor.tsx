"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  changeBookingService,
  listSellableServices,
  type SellableService,
} from "@/app/kasse/actions";
import { isAddonCategory } from "@/lib/service-categories";
import { formatKr } from "@/lib/format";

/* =====================================================================
 * ENDRE BEHANDLING (gjenbrukbar)
 *   Velg ny hovedbehandling + kryss av tillegg. Lagrer på selve bookingen
 *   (change_booking_service → pris/varighet/kalender oppdateres server-side).
 *   Brukes både i booking-popupen og som steg 1 i kassa.
 * ===================================================================== */

export function ServiceEditor({
  bookingId,
  initialService,
  initialAddons = [],
  onSaved,
  onCancel,
  saveLabel = "Lagre endring",
}: {
  bookingId: string;
  initialService: string | null;
  initialAddons?: string[];
  /** Kalt når endringen er lagret. Beløpet er klient-estimat; hent autoritativt ved behov. */
  onSaved: (res: { service: string; addons: string[]; price: number }) => void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  const [all, setAll] = useState<SellableService[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [service, setService] = useState<string>(initialService ?? "");
  const [addons, setAddons] = useState<string[]>(initialAddons);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listSellableServices().then((s) => {
      if (!alive) return;
      setAll(s);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const mains = useMemo(
    () => all.filter((s) => !isAddonCategory(s.category)),
    [all],
  );
  const tillegg = useMemo(
    () => all.filter((s) => isAddonCategory(s.category)),
    [all],
  );

  // Hovedbehandlinger gruppert på kategori (beholder serverens rekkefølge).
  const grouped = useMemo(() => {
    const out: { category: string; items: SellableService[] }[] = [];
    for (const s of mains) {
      const cat = s.category ?? "Annet";
      const g = out.find((o) => o.category === cat);
      if (g) g.items.push(s);
      else out.push({ category: cat, items: [s] });
    }
    return out;
  }, [mains]);

  const mainPrice = mains.find((s) => s.name === service)?.price_nok ?? 0;
  const addonPrice = tillegg
    .filter((s) => addons.includes(s.name))
    .reduce((a, s) => a + s.price_nok, 0);
  const preview = mainPrice + addonPrice;

  function toggleAddon(name: string) {
    setAddons((cur) =>
      cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name],
    );
  }

  function save() {
    if (!service) {
      setError("Velg en behandling først.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await changeBookingService(bookingId, service, addons);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onSaved({ service, addons, price: preview });
    });
  }

  if (!loaded) {
    return <p className="py-3 text-sm text-muted">Henter behandlinger …</p>;
  }

  return (
    <div className="space-y-3">
      {/* Hovedbehandling */}
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          Behandling
        </p>
        <div className="max-h-56 space-y-2 overflow-auto rounded-lg border border-line bg-surface p-2">
          {grouped.map((g) => (
            <div key={g.category}>
              <p className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {g.category}
              </p>
              <div className="space-y-1">
                {g.items.map((s) => {
                  const on = s.name === service;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setService(s.name)}
                      className={
                        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                        (on
                          ? "border-accent-soft bg-accent-soft/10 text-fg"
                          : "border-line text-fg hover:border-accent-soft")
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatKr(s.price_nok)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tillegg */}
      {tillegg.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            Tillegg
          </p>
          <div className="space-y-1">
            {tillegg.map((s) => {
              const on = addons.includes(s.name);
              return (
                <label
                  key={s.name}
                  className={
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors " +
                    (on
                      ? "border-accent-soft bg-accent-soft/10 text-fg"
                      : "border-line text-fg hover:border-accent-soft")
                  }
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleAddon(s.name)}
                      className="h-4 w-4 accent-[#F47721]"
                    />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    + {formatKr(s.price_nok)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Forhåndsvist pris */}
      <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">
          Ny pris
        </span>
        <span className="font-display text-base font-bold text-fg tabular-nums">
          {formatKr(preview)}
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !service}
          onClick={save}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Lagrer …" : saveLabel}
        </button>
        {onCancel && (
          <button type="button" disabled={pending} onClick={onCancel} className="act">
            Avbryt
          </button>
        )}
      </div>
    </div>
  );
}
