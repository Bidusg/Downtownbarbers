"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShopBarber } from "@/lib/shop-queries";
import {
  recordWalkinSale,
  listSellableProducts,
  listSellableServices,
  type SellableProduct,
  type SellableService,
} from "@/app/kasse/actions";

const PAYMENTS = ["Kontant", "Kort", "Vipps"];
const kr = (n: number) => `${Math.round(n)} kr`;

const inputCls =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-accent-soft";

/**
 * Hurtigsalg / drop-in: ta betalt uten booking. Velg evt. barber + behandling,
 * legg til varer, fyll inn kundeinfo (lagres i kartoteket) og kryss av for
 * medlem (samtykke → klubbgoder). Salget registreres via record_walkin_sale.
 */
export function QuickSale({
  barbers,
  canDiscount = true,
}: {
  barbers: ShopBarber[];
  canDiscount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const [services, setServices] = useState<SellableService[]>([]);
  const [products, setProducts] = useState<SellableProduct[]>([]);

  const [barberId, setBarberId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [makeMember, setMakeMember] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rabatt + splittbetaling
  const [discount, setDiscount] = useState("");
  const [split, setSplit] = useState(false);
  const [splitAmts, setSplitAmts] = useState<Record<string, string>>({});

  function openModal() {
    setError(null);
    setOpen(true);
    listSellableServices().then(setServices);
    listSellableProducts().then(setProducts);
  }
  function close() {
    setOpen(false);
    setServiceName("");
    setCart({});
    setName("");
    setEmail("");
    setPhone("");
    setMakeMember(false);
    setReceipt(false);
    setError(null);
    setDiscount("");
    setSplit(false);
    setSplitAmts({});
  }

  const servicePrice = useMemo(
    () => services.find((s) => s.name === serviceName)?.price_nok ?? 0,
    [services, serviceName],
  );
  const cartLines = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] ?? 0) > 0)
        .map((p) => ({ ...p, qty: cart[p.id] })),
    [products, cart],
  );
  const productTotal = cartLines.reduce((a, l) => a + l.price_nok * l.qty, 0);
  const gross = servicePrice + productTotal;
  const discountNum = Math.max(0, Math.round(Number(discount) || 0));
  const total = Math.max(0, Math.round(gross) - discountNum);
  const hasSomething = !!serviceName || cartLines.length > 0;

  const splitEntries = PAYMENTS.map((m) => ({
    method: m,
    amount: Math.max(0, Math.round(Number(splitAmts[m]) || 0)),
  })).filter((e) => e.amount > 0);
  const splitSum = splitEntries.reduce((a, e) => a + e.amount, 0);
  const splitOk = splitSum === total && total > 0;

  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  function pay(method: string) {
    if (!hasSomething) {
      setError("Velg en behandling eller minst én vare.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await recordWalkinSale({
        staffId: barberId || undefined,
        paymentMethod: method,
        service: serviceName || undefined,
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        customer: { name, email, phone },
        makeMember,
        discountNok: discountNum,
        sendReceipt: receipt && !!email.trim(),
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function paySplit() {
    if (!hasSomething) {
      setError("Velg en behandling eller minst én vare.");
      return;
    }
    if (!splitOk) {
      setError(`Betalingen (${splitSum} kr) må stemme med totalen (${total} kr).`);
      return;
    }
    setError(null);
    start(async () => {
      const res = await recordWalkinSale({
        staffId: barberId || undefined,
        paymentMethod: splitEntries[0]?.method ?? "Delt",
        service: serviceName || undefined,
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        customer: { name, email, phone },
        makeMember,
        discountNok: discountNum,
        payments: splitEntries,
        sendReceipt: receipt && !!email.trim(),
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={openModal}
        className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
      >
        Hurtigsalg
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Hurtigsalg / drop-in</h2>
              <button onClick={close} className="rounded-full px-2 text-muted hover:text-fg" aria-label="Lukk">
                ✕
              </button>
            </div>

            {/* Barber (valgfri) */}
            <label className="mb-3 block text-xs text-muted">
              Barber (valgfri)
              <select
                value={barberId}
                onChange={(e) => setBarberId(e.target.value)}
                className={`mt-1 ${inputCls}`}
              >
                <option value="">— Ingen valgt —</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>{b.full_name}</option>
                ))}
              </select>
            </label>

            {/* Behandling (valgfri) */}
            <label className="mb-3 block text-xs text-muted">
              Behandling (valgfri)
              <select
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className={`mt-1 ${inputCls}`}
              >
                <option value="">— Ingen behandling —</option>
                {services.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} · {kr(s.price_nok)}
                  </option>
                ))}
              </select>
            </label>

            {/* Varer */}
            {products.length > 0 && (
              <div className="mb-3 rounded-lg border border-line bg-canvas p-3">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Varer{cartLines.length > 0 ? ` (${cartLines.length})` : ""}
                </span>
                <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {products.map((p) => {
                    const qty = cart[p.id] ?? 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg">
                          {p.name}
                          <span className="text-muted"> · {kr(p.price_nok)}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setQty(p.id, qty - 1)}
                            disabled={qty <= 0}
                            className="h-6 w-6 rounded border border-line-2 text-muted hover:text-fg disabled:opacity-30"
                            aria-label={`Færre ${p.name}`}
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-sm tabular-nums text-fg">{qty}</span>
                          <button
                            onClick={() => setQty(p.id, qty + 1)}
                            className="h-6 w-6 rounded border border-line-2 text-muted hover:text-fg"
                            aria-label={`Flere ${p.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Kundeinfo */}
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn" className={inputCls} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" className={inputCls} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" inputMode="tel" className={inputCls} />
            </div>
            <p className="mb-3 text-xs text-muted">Kundeinfo lagres i kundekartoteket.</p>

            {/* Kvittering (kun når e-post er fylt inn) */}
            {email.trim() && (
              <label className="mb-3 flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={receipt}
                  onChange={(e) => setReceipt(e.target.checked)}
                />
                Send kvittering på e-post
              </label>
            )}

            {/* Medlem */}
            <label className="mb-3 flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={makeMember}
                onChange={(e) => setMakeMember(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Legg til som medlem i kundeklubben (samtykke til tilbud/goder på
                e-post/SMS). Krever navn + e-post eller telefon.
              </span>
            </label>

            {/* Rabatt (skjules hvis deaktivert i shop-innstillinger) */}
            {canDiscount && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Rabatt (kr)
                </label>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  inputMode="numeric"
                  aria-label="Rabatt i kroner"
                  className="w-24 rounded-md border border-line bg-canvas px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted outline-none focus:border-accent-soft"
                />
              </div>
            )}

            {/* Total */}
            <div className="mb-3 rounded-lg bg-canvas px-3 py-2">
              {discountNum > 0 && (
                <div className="mb-1 text-xs text-muted">
                  Sum {kr(gross)} · rabatt −{kr(discountNum)}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">Å betale</span>
                <span className="font-display text-lg font-bold text-fg tabular-nums">{kr(total)}</span>
              </div>
            </div>

            {error && (
              <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            {/* Betaling: enkel eller delt */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-muted">
                {split ? "Del betalingen på flere måter:" : "Betalt med:"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSplit((v) => !v);
                  setError(null);
                }}
                className="text-xs font-semibold text-accent-soft hover:underline"
              >
                {split ? "Enkel betaling" : "Del betaling"}
              </button>
            </div>

            {split ? (
              <div className="space-y-2">
                {PAYMENTS.map((m) => (
                  <div key={m} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-fg">{m}</span>
                    <input
                      value={splitAmts[m] ?? ""}
                      onChange={(e) =>
                        setSplitAmts((s) => ({
                          ...s,
                          [m]: e.target.value.replace(/[^0-9]/g, ""),
                        }))
                      }
                      placeholder="0"
                      inputMode="numeric"
                      aria-label={`Beløp ${m}`}
                      className="w-28 rounded-md border border-line bg-canvas px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted outline-none focus:border-accent-soft"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
                  <span className={splitOk ? "text-accent-soft" : "text-muted"}>
                    Fordelt: {kr(splitSum)} / {kr(total)}
                    {splitSum !== total &&
                      ` · ${splitSum > total ? "−" : "mangler "}${kr(Math.abs(total - splitSum))}`}
                  </span>
                  <button
                    type="button"
                    disabled={pending || !hasSomething || !splitOk}
                    onClick={paySplit}
                    className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {pending ? "…" : "Registrer betaling"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {PAYMENTS.map((p) => (
                  <button
                    key={p}
                    disabled={pending || !hasSomething}
                    onClick={() => pay(p)}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "…" : p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
