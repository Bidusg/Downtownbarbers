"use client";

import { useState, useTransition } from "react";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { findProductByBarcode, type BarcodeProduct } from "@/app/kasse/actions";
import { scanAdjustStock } from "@/app/admin/lager/actions";

const REASONS = [
  { value: "varemottak", label: "Varemottak (inn)" },
  { value: "svinn", label: "Svinn (ut)" },
  { value: "telling", label: "Opptelling" },
  { value: "justering", label: "Justering" },
];

/**
 * Skann en vare, skriv inn antall inn/ut, lagre ny beholdning. Funker fra
 * admin og fra shop-iPad (kamera eller strekkodeleser).
 */
export function StockScanAdjust() {
  const [found, setFound] = useState<BarcodeProduct | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("varemottak");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [looking, startLook] = useTransition();
  const [saving, startSave] = useTransition();

  function onScan(code: string) {
    setMsg(null);
    setErr(false);
    setUnknown(null);
    startLook(async () => {
      const p = await findProductByBarcode(code);
      if (p) {
        setFound(p);
        setQty("1");
      } else {
        setFound(null);
        setUnknown(code);
      }
    });
  }

  function save() {
    if (!found) return;
    const n = Math.max(1, Math.trunc(Number(qty) || 0));
    setMsg(null);
    setErr(false);
    startSave(async () => {
      const r = await scanAdjustStock(found.id, dir * n, reason);
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      } else {
        setMsg(
          `${found.name}: ny beholdning ${r.newStock}. Skann neste vare.`,
        );
        setFound(null); // klar for neste skann
      }
    });
  }

  return (
    <div className="space-y-3 border border-line bg-surface p-4">
      <h3 className="font-semibold text-fg">Lager ved skanning</h3>
      <BarcodeScanner onScan={onScan} />

      {looking && <p className="text-xs text-muted">Slår opp …</p>}
      {unknown && (
        <p className="text-xs text-danger">
          Ukjent strekkode ({unknown}). Sett strekkoden på produktet i Produkter
          først.
        </p>
      )}

      {found && (
        <div className="space-y-3 rounded-md border border-line bg-canvas p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-fg">{found.name}</span>
            <span className="text-xs text-muted">
              Nå: {found.stock} på lager
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex overflow-hidden rounded-md border border-line-2">
              <button
                type="button"
                onClick={() => setDir(1)}
                className={
                  "px-3 py-1.5 text-sm font-semibold " +
                  (dir === 1 ? "bg-accent text-accent-fg" : "text-fg")
                }
              >
                Inn +
              </button>
              <button
                type="button"
                onClick={() => setDir(-1)}
                className={
                  "px-3 py-1.5 text-sm font-semibold " +
                  (dir === -1 ? "bg-accent text-accent-fg" : "text-fg")
                }
              >
                Ut −
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Antall
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="w-20 rounded-md border border-line-2 bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-accent-soft"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Årsak
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-md border border-line-2 bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-accent-soft"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "Lagrer …" : "Lagre"}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={"text-sm " + (err ? "text-danger" : "text-accent-soft")}>
          {msg}
        </p>
      )}
    </div>
  );
}
