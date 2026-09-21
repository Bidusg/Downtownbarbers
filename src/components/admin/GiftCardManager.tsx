"use client";

import { useState, useTransition } from "react";
import type { GiftCard } from "@/lib/ops-queries";
import {
  createGiftCard,
  redeemGiftCard,
  deleteGiftCard,
  setGiftCardBarcode,
} from "@/app/admin/gavekort/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

/** Inline strekkode-celle: vis/sett/skann strekkode på et gavekort. */
function GiftBarcodeCell({ id, barcode }: { id: string; barcode: string | null }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [, start] = useTransition();

  const save = (code: string) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      const r = await setGiftCardBarcode(id, code);
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      } else {
        setOpen(false);
      }
    });

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <span className={barcode ? "font-mono text-xs text-fg" : "text-xs text-muted"}>
          {barcode || "—"}
        </span>
        <button
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className="text-xs text-accent-soft hover:underline"
        >
          {barcode ? "Endre" : "Koble"}
        </button>
      </div>
    );
  }
  return (
    <div className="w-64 space-y-1">
      <BarcodeScanner onScan={save} autoFocus />
      {msg && err && <p className="text-xs text-danger">{msg}</p>}
      <button
        onClick={() => {
          setOpen(false);
          setMsg(null);
        }}
        className="text-xs text-muted hover:text-fg hover:underline"
      >
        Avbryt
      </button>
    </div>
  );
}

function no(iso: string | null) {
  if (!iso) return "Ingen";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function GiftCardManager({ cards }: { cards: GiftCard[] }) {
  const [open, setOpen] = useState(false);
  const [pending] = useTransition();

  const outstanding = cards.reduce((s, c) => s + Number(c.balance_nok), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {cards.length} gavekort · utestående saldo {kr(outstanding)}
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Nytt gavekort"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createGiftCard(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-3"
        >
          <input name="initial_nok" type="number" min={1} placeholder="Beløp (kr)" required className={inputCls} />
          <input name="code" placeholder="Kode (auto hvis tom)" className={inputCls} />
          <input name="barcode" placeholder="Strekkode (valgfritt)" className={inputCls} />
          <label className="text-xs text-muted">
            Utløper (valgfritt)
            <input name="expires_at" type="date" className={`mt-1 block w-full ${inputCls}`} />
          </label>
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-3"
          >
            Utsted gavekort
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Strekkode</th>
              <th className="px-4 py-3">Opprinnelig</th>
              <th className="px-4 py-3">Saldo</th>
              <th className="px-4 py-3">Utløper</th>
              <th className="px-4 py-3">Innløs</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Ingen gavekort enda.
                </td>
              </tr>
            )}
            {cards.map((c) => {
              const used = Number(c.balance_nok) <= 0;
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-4 py-3 font-display font-medium text-fg">
                    {c.code}
                  </td>
                  <td className="px-4 py-3">
                    <GiftBarcodeCell id={c.id} barcode={c.barcode} />
                  </td>
                  <td className="px-4 py-3 text-muted">{kr(c.initial_nok)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        used ? "text-muted" : "font-semibold text-accent-soft"
                      }
                    >
                      {kr(c.balance_nok)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{no(c.expires_at)}</td>
                  <td className="px-4 py-3">
                    {used ? (
                      <span className="text-xs text-muted">Brukt opp</span>
                    ) : (
                      <form action={redeemGiftCard} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input
                          name="amount"
                          type="number"
                          min={1}
                          max={Number(c.balance_nok)}
                          placeholder="kr"
                          required
                          className="w-20 border border-line-2 bg-canvas px-2 py-1 text-sm outline-none focus:border-accent-soft"
                        />
                        <button
                          type="submit"
                          className="bg-accent-soft/15 px-2.5 py-1 text-xs font-semibold text-accent-soft hover:bg-accent-soft/25"
                        >
                          Trekk
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ConfirmButton
                      label="Slett"
                      question={`Slette gavekort ${c.code}?`}
                      confirmLabel="Ja, slett"
                      pendingLabel="Sletter …"
                      disabled={pending}
                      onConfirm={() => deleteGiftCard(c.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
