"use client";

import { useState, useTransition } from "react";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import {
  findGiftCard,
  redeemGiftCardByCode,
  type GiftCardHit,
} from "@/app/admin/gavekort/actions";

const kr = (n: number) => `${Math.round(n)} kr`;

/**
 * Skann/skriv gavekort-strekkode → saldo kommer opp → innløs et beløp.
 * Funker fra admin og shop-iPad (kamera eller strekkodeleser).
 */
export function GiftCardScan() {
  const [card, setCard] = useState<GiftCardHit | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [looking, startLook] = useTransition();
  const [saving, startSave] = useTransition();

  function onScan(code: string) {
    setMsg(null);
    setErr(false);
    setUnknown(null);
    startLook(async () => {
      const c = await findGiftCard(code);
      if (c) {
        setCard(c);
        setAmount("");
      } else {
        setCard(null);
        setUnknown(code);
      }
    });
  }

  function redeem() {
    if (!card) return;
    const amt = Math.max(0, Math.round(Number(amount) || 0));
    if (amt <= 0) {
      setErr(true);
      setMsg("Skriv inn et beløp.");
      return;
    }
    setMsg(null);
    setErr(false);
    startSave(async () => {
      const r = await redeemGiftCardByCode(card.code, amt);
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      } else {
        setMsg(
          `Innløst ${kr(r.redeemed ?? 0)}. Ny saldo: ${kr(r.newBalance ?? 0)}.`,
        );
        setCard({ ...card, balanceNok: r.newBalance ?? 0 });
        setAmount("");
      }
    });
  }

  return (
    <div className="space-y-3 border border-line bg-surface p-4">
      <h3 className="font-semibold text-fg">Gavekort – skann &amp; innløs</h3>
      <BarcodeScanner onScan={onScan} />

      {looking && <p className="text-xs text-muted">Slår opp …</p>}
      {unknown && (
        <p className="text-xs text-danger">
          Fant ikke gavekort ({unknown}). Sjekk koden, eller sett strekkoden på
          gavekortet først.
        </p>
      )}

      {card && (
        <div className="space-y-3 rounded-md border border-line bg-canvas p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-fg">{card.code}</span>
            <span className="font-display text-lg font-bold text-fg">
              {kr(card.balanceNok)}
            </span>
          </div>
          {card.expired && (
            <p className="text-xs text-danger">Gavekortet er utløpt.</p>
          )}
          {!card.expired && card.balanceNok > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Innløs beløp (kr)
                <input
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  inputMode="numeric"
                  placeholder={String(Math.round(card.balanceNok))}
                  className="w-28 rounded-md border border-line-2 bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-accent-soft"
                />
              </label>
              <button
                type="button"
                onClick={() => setAmount(String(Math.round(card.balanceNok)))}
                className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-fg hover:border-accent-soft"
              >
                Hele saldoen
              </button>
              <button
                type="button"
                onClick={redeem}
                disabled={saving}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Innløser …" : "Innløs"}
              </button>
            </div>
          )}
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
