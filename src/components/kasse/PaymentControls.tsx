"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  completeBooking,
  getBookingPrice,
  getBookingLoyalty,
  listSellableProducts,
  type SellableProduct,
  type BookingLoyalty,
} from "@/app/kasse/actions";
import { redeemLoyalty } from "@/app/kasse/kunder/[id]/loyalty-actions";

const PAYMENTS = ["Kontant", "Kort", "Vipps"];

const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted transition-colors focus:border-accent-soft focus:outline-none";

function kr(n: number) {
  return `${Math.round(n)} kr`;
}

/**
 * Betaling ved fullført time: valgfri kundeinfo (drop-in → CRM), varesalg
 * (produkter i tillegg til tjenesten), kvittering på e-post, og betalingsmåte.
 *
 * Registrerer salget via completeBooking (atomisk record_sale). Feiler det,
 * vises feilen og timen forblir åpen – onDone kalles KUN når salget er lagret.
 * Gjenbrukes i dagsliste + kalender.
 */
export function PaymentControls({
  bookingId,
  customerName,
  customerEmail,
  onDone,
}: {
  bookingId: string;
  customerName: string;
  customerEmail: string | null;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const hasEmail = !!customerEmail;
  const [showInfo, setShowInfo] = useState(!hasEmail);
  const [name, setName] = useState(
    customerName && customerName !== "—" ? customerName : "",
  );
  const [email, setEmail] = useState(customerEmail ?? "");
  const [phone, setPhone] = useState("");
  const [receipt, setReceipt] = useState(hasEmail);
  const [error, setError] = useState<string | null>(null);

  // Varesalg
  const [servicePrice, setServicePrice] = useState<number | null>(null);
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showProducts, setShowProducts] = useState(false);

  // Klippekort
  const [loyalty, setLoyalty] = useState<BookingLoyalty | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [redeeming, startRedeem] = useTransition();

  // Rabatt + splittbetaling
  const [discount, setDiscount] = useState("");
  const [split, setSplit] = useState(false);
  const [splitAmts, setSplitAmts] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    getBookingPrice(bookingId).then((p) => alive && setServicePrice(p));
    listSellableProducts().then((p) => alive && setProducts(p));
    getBookingLoyalty(bookingId).then((l) => alive && setLoyalty(l));
    return () => {
      alive = false;
    };
  }, [bookingId]);

  function redeem() {
    if (!loyalty) return;
    setError(null);
    startRedeem(async () => {
      const status = await redeemLoyalty(loyalty.customerId);
      if (status === "ok") {
        setRedeemed(true);
        setLoyalty({ ...loyalty, rewardDue: false, progress: 0 });
      } else {
        setError(
          status === "not_ready"
            ? "Ikke nok klipp til å løse inn ennå."
            : status === "forbidden"
              ? "Ingen tilgang til å løse inn."
              : "Kunne ikke løse inn klippekortet. Prøv igjen.",
        );
      }
    });
  }

  const cartLines = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] ?? 0) > 0)
        .map((p) => ({ ...p, qty: cart[p.id] })),
    [products, cart],
  );
  const productTotal = cartLines.reduce((a, l) => a + l.price_nok * l.qty, 0);
  const gross = (servicePrice ?? 0) + productTotal;
  const discountNum = Math.max(0, Math.round(Number(discount) || 0));
  const total = Math.max(0, Math.round(gross) - discountNum);

  // Splittbetaling: beløp per måte, sum, og om det stemmer med totalen.
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
    setError(null);
    start(async () => {
      const res = await completeBooking(bookingId, {
        paymentMethod: method,
        customer: showInfo ? { name, email, phone } : undefined,
        sendReceipt: receipt && !!(email.trim() || customerEmail),
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        discountNok: discountNum,
      });
      if (res?.error) {
        setError(res.error);
        return; // timen forblir åpen – ikke lukk
      }
      onDone();
    });
  }

  function paySplit() {
    setError(null);
    if (!splitOk) {
      setError(`Betalingen (${splitSum} kr) må stemme med totalen (${total} kr).`);
      return;
    }
    start(async () => {
      const res = await completeBooking(bookingId, {
        customer: showInfo ? { name, email, phone } : undefined,
        sendReceipt: receipt && !!(email.trim() || customerEmail),
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        discountNok: discountNum,
        payments: splitEntries,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div>
      {showInfo ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navn"
            className={inputCls}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-post (for kvittering)"
            className={inputCls}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon"
            className={inputCls}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowInfo(true)}
          className="mb-2 block text-xs font-semibold text-accent-soft hover:underline"
        >
          + Rediger kundeinfo
        </button>
      )}

      {/* Varesalg */}
      {products.length > 0 && (
        <div className="mb-3 rounded-lg border border-line bg-canvas p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-muted uppercase">
              Varer{cartLines.length > 0 ? ` (${cartLines.length})` : ""}
            </span>
            <button
              onClick={() => setShowProducts((v) => !v)}
              className="text-xs font-semibold text-accent-soft hover:underline"
            >
              {showProducts ? "Skjul" : "+ Legg til vare"}
            </button>
          </div>

          {showProducts && (
            <div className="mt-2 max-h-48 space-y-1 overflow-auto">
              {products.map((p) => {
                const qty = cart[p.id] ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
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
                      <span className="w-5 text-center text-sm tabular-nums text-fg">
                        {qty}
                      </span>
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
          )}

          {cartLines.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-muted">
              {cartLines.map((l) => (
                <li key={l.id} className="flex justify-between">
                  <span>
                    {l.qty}× {l.name}
                  </span>
                  <span className="tabular-nums">{kr(l.price_nok * l.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={receipt}
          onChange={(e) => setReceipt(e.target.checked)}
        />
        Send kvittering på e-post
      </label>

      {/* Klippekort */}
      {loyalty && (
        <div className="mb-3 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
          {redeemed ? (
            <span className="font-semibold text-accent-soft">
              Gratis klipp løst inn ✓ — telleren er nullstilt.
            </span>
          ) : loyalty.rewardDue ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-accent-soft">
                Gratis klipp opptjent! 🎉
              </span>
              <button
                type="button"
                onClick={redeem}
                disabled={redeeming}
                className="rounded-md bg-accent-soft px-3 py-1.5 font-semibold text-[#211E1A] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {redeeming ? "Løser inn …" : "Løs inn gratis klipp"}
              </button>
            </div>
          ) : (
            <span className="text-muted">
              Klippekort: {loyalty.progress} / {loyalty.required} klipp
            </span>
          )}
        </div>
      )}

      {/* Rabatt */}
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
          className="w-24 rounded-md border border-line bg-surface px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
        />
      </div>

      {/* Total */}
      <div className="mb-3 rounded-lg bg-canvas px-3 py-2">
        {discountNum > 0 && (
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Sum {kr(gross)} · rabatt −{kr(discountNum)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">
            Å betale
          </span>
          <span className="font-display text-lg font-bold text-fg tabular-nums">
            {servicePrice === null ? "…" : kr(total)}
          </span>
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
                className="w-28 rounded-md border border-line bg-surface px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
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
              disabled={pending || !splitOk}
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
              disabled={pending}
              onClick={() => pay(p)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "…" : p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
