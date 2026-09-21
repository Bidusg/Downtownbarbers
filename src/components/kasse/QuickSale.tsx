"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShopBarber } from "@/lib/shop-queries";
import {
  recordWalkinSale,
  listSellableProducts,
  listSellableServices,
  getKasseAllowances,
  searchCustomers,
  type SellableProduct,
  type SellableService,
  type KasseAllowances,
  type CustomerHit,
} from "@/app/kasse/actions";

const PAYMENTS = ["Kontant", "Kort", "Vipps"];
const kr = (n: number) => `${Math.round(n)} kr`;

const inputCls =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-accent-soft";

const STEPS = ["Ansatt", "Tjeneste", "Produkter", "Kunde", "Rabatt", "Betaling"];

type SelectedCustomer = { id: string; name: string };

/**
 * Hurtigsalg / drop-in – stegvis flyt: ansatt → tjeneste → produkter → kunde
 * → rabatt → betaling. Ansatt/tjeneste går automatisk videre ved valg, med
 * Neste/Forrige for manuell overstyring. «Kunde før betaling» søker på
 * telefonnr og knytter salget til en eksisterende kunde. Registreres atomisk
 * via record_walkin_sale.
 */
export function QuickSale({ barbers }: { barbers: ShopBarber[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();

  const [services, setServices] = useState<SellableService[]>([]);
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [allow, setAllow] = useState<KasseAllowances | null>(null);

  const [barberId, setBarberId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  // Kunde: enten valgt eksisterende (fra søk) eller manuelt innfylt.
  const [picked, setPicked] = useState<SelectedCustomer | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [makeMember, setMakeMember] = useState(false);
  const [receipt, setReceipt] = useState(false);

  const [discount, setDiscount] = useState("");
  const [split, setSplit] = useState(false);
  const [splitAmts, setSplitAmts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    reset();
    setOpen(true);
    listSellableServices().then(setServices);
    listSellableProducts().then(setProducts);
    getKasseAllowances().then(setAllow);
  }
  function reset() {
    setStep(0);
    setBarberId("");
    setServiceName("");
    setCart({});
    setPicked(null);
    setCustQuery("");
    setHits([]);
    setName("");
    setEmail("");
    setPhone("");
    setMakeMember(false);
    setReceipt(false);
    setDiscount("");
    setSplit(false);
    setSplitAmts({});
    setError(null);
  }
  function close() {
    setOpen(false);
  }

  // Kundesøk (telefon/navn), debouncet. Hopp over når en kunde alt er valgt.
  // All state settes i den asynkrone callbacken (ingen synkron setState i
  // effekt-kroppen); trefflista rendres kun når søket er ≥ 2 tegn.
  useEffect(() => {
    if (picked) return;
    const q = custQuery.trim();
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchCustomers(q).then((res) => {
        if (alive) {
          setHits(res);
          setSearching(false);
        }
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [custQuery, picked]);

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
  const hasCustomer = !!picked || !!(name.trim() || email.trim() || phone.trim());
  const customerRequired = allow ? !allow.dropinWithoutCustomerAllowed : false;
  // Kvittering kan sendes til en oppslått kunde (serveren har e-posten) eller
  // til en manuelt innfylt e-post.
  const canReceipt = !!picked || !!email.trim();

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

  const barberName = barbers.find((b) => b.id === barberId)?.full_name ?? null;

  // Steg-navigasjon -------------------------------------------------------
  function go(next: number) {
    setError(null);
    // Kunde-steget: krev kunde hvis drop-in uten kunde er av (går videre).
    if (step === 3 && next > 3 && customerRequired && !hasCustomer) {
      setError("Registrer kunde – drop-in uten kunde er slått av.");
      return;
    }
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  }
  function pickBarber(id: string) {
    setBarberId(id);
    go(1);
  }
  function pickService(nameSel: string) {
    setServiceName(nameSel);
    go(2);
  }
  function selectCustomer(h: CustomerHit) {
    setPicked({ id: h.id, name: h.full_name });
    setName(h.full_name);
    setEmail("");
    setPhone("");
    setHits([]);
    setCustQuery("");
  }
  function clearCustomer() {
    setPicked(null);
    setName("");
    setEmail("");
    setPhone("");
  }

  function submit(method: string, useSplit: boolean) {
    if (!hasSomething) {
      setError("Velg en behandling eller minst én vare.");
      return;
    }
    if (customerRequired && !hasCustomer) {
      setError("Registrer kunde – drop-in uten kunde er slått av.");
      return;
    }
    if (useSplit && !splitOk) {
      setError(`Betalingen (${kr(splitSum)}) må stemme med totalen (${kr(total)}).`);
      return;
    }
    setError(null);
    start(async () => {
      const res = await recordWalkinSale({
        staffId: barberId || undefined,
        paymentMethod: useSplit ? (splitEntries[0]?.method ?? "Delt") : method,
        service: serviceName || undefined,
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        customerId: picked?.id,
        customer: picked
          ? undefined
          : { name: name, email: email, phone: phone },
        makeMember,
        discountNok: discountNum,
        payments: useSplit ? splitEntries : undefined,
        sendReceipt: receipt,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  // Kan gå videre fra gjeldende steg (payment-steget har egne knapper).
  const canNext = step < 5;

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
            className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header + stegindikator */}
            <div className="border-b border-line p-5 pb-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">
                  Hurtigsalg · {STEPS[step]}
                </h2>
                <button
                  onClick={close}
                  className="rounded-full px-2 text-muted hover:text-fg"
                  aria-label="Lukk"
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-1">
                {STEPS.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => go(i)}
                    className={
                      "h-1.5 flex-1 rounded-full transition-colors " +
                      (i <= step ? "bg-accent" : "bg-surface-2")
                    }
                    aria-label={`Gå til ${s}`}
                  />
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Steg 0: Ansatt */}
              {step === 0 && (
                <div>
                  <p className="mb-3 text-xs text-muted">
                    Hvem tar salget? (valgfritt – salget krediteres barberen)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {barbers.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => pickBarber(b.id)}
                        className={
                          "rounded-lg border px-3 py-3 text-sm font-semibold transition-colors " +
                          (barberId === b.id
                            ? "border-accent-soft bg-accent-soft/10 text-fg"
                            : "border-line text-fg hover:border-accent-soft")
                        }
                      >
                        {b.full_name}
                      </button>
                    ))}
                    <button
                      onClick={() => pickBarber("")}
                      className="rounded-lg border border-line px-3 py-3 text-sm text-muted hover:border-accent-soft"
                    >
                      Ingen / hopp over
                    </button>
                  </div>
                </div>
              )}

              {/* Steg 1: Tjeneste */}
              {step === 1 && (
                <div>
                  <p className="mb-3 text-xs text-muted">
                    Behandling (valgfritt – kan selge bare varer)
                  </p>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => pickService("")}
                      className={
                        "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors " +
                        (serviceName === ""
                          ? "border-accent-soft bg-accent-soft/10"
                          : "border-line hover:border-accent-soft")
                      }
                    >
                      Ingen behandling
                    </button>
                    {services.map((s) => (
                      <button
                        key={s.name}
                        onClick={() => pickService(s.name)}
                        className={
                          "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors " +
                          (serviceName === s.name
                            ? "border-accent-soft bg-accent-soft/10"
                            : "border-line hover:border-accent-soft")
                        }
                      >
                        <span className="text-fg">{s.name}</span>
                        <span className="font-display text-muted">
                          {kr(s.price_nok)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Steg 2: Produkter */}
              {step === 2 && (
                <div>
                  <p className="mb-3 text-xs text-muted">
                    Varer (valgfritt)
                    {cartLines.length > 0 ? ` · ${cartLines.length} i kurv` : ""}
                  </p>
                  {products.length === 0 ? (
                    <p className="text-sm text-muted">Ingen varer tilgjengelig.</p>
                  ) : (
                    <div className="space-y-1">
                      {products.map((p) => {
                        const qty = cart[p.id] ?? 0;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate text-fg">
                              {p.name}
                              <span className="text-muted"> · {kr(p.price_nok)}</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setQty(p.id, qty - 1)}
                                disabled={qty <= 0}
                                className="h-7 w-7 rounded border border-line-2 text-muted hover:text-fg disabled:opacity-30"
                                aria-label={`Færre ${p.name}`}
                              >
                                −
                              </button>
                              <span className="w-5 text-center tabular-nums text-fg">
                                {qty}
                              </span>
                              <button
                                onClick={() => setQty(p.id, qty + 1)}
                                className="h-7 w-7 rounded border border-line-2 text-muted hover:text-fg"
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
                </div>
              )}

              {/* Steg 3: Kunde */}
              {step === 3 && (
                <div>
                  {picked ? (
                    <div className="rounded-lg border border-accent-soft/40 bg-accent-soft/10 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted">Knyttet til kunde</p>
                          <p className="font-semibold text-fg">{picked.name}</p>
                        </div>
                        <button
                          onClick={clearCustomer}
                          className="text-xs text-accent-soft hover:underline"
                        >
                          Fjern
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-muted">
                        Søk opp kunde på telefonnr eller navn, eller fyll inn ny.
                        {customerRequired && (
                          <span className="text-danger"> Kunde kreves.</span>
                        )}
                      </p>
                      <input
                        value={custQuery}
                        onChange={(e) => setCustQuery(e.target.value)}
                        placeholder="Telefon eller navn …"
                        className={inputCls}
                        inputMode="tel"
                      />
                      {custQuery.trim().length >= 2 && (
                        <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-line">
                          {searching && (
                            <p className="px-3 py-2 text-xs text-muted">Søker …</p>
                          )}
                          {!searching && hits.length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted">
                              Ingen treff – fyll inn som ny kunde nedenfor.
                            </p>
                          )}
                          {hits.map((h) => (
                            <button
                              key={h.id}
                              onClick={() => selectCustomer(h)}
                              className="flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
                            >
                              <span className="text-fg">{h.full_name}</span>
                              <span className="text-xs text-muted">
                                {h.visits} besøk
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 grid gap-2">
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={customerRequired ? "Navn *" : "Navn (ny kunde)"}
                          className={inputCls}
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="E-post"
                            className={inputCls}
                          />
                          <input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="Telefon"
                            inputMode="tel"
                            className={inputCls}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Medlem + kvittering */}
                  <label className="mt-3 flex items-start gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={makeMember}
                      onChange={(e) => setMakeMember(e.target.checked)}
                      className="mt-0.5 accent-accent"
                    />
                    <span>
                      Legg til som medlem i kundeklubben (samtykke til tilbud/goder).
                    </span>
                  </label>
                  {canReceipt && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={receipt}
                        onChange={(e) => setReceipt(e.target.checked)}
                        className="accent-accent"
                      />
                      Send kvittering på e-post
                      {picked && " (til kundens registrerte e-post)"}
                    </label>
                  )}
                </div>
              )}

              {/* Steg 4: Rabatt */}
              {step === 4 && (
                <div>
                  {!allow?.friendFamilyEnabled && !allow?.discountAllowed && (
                    <p className="text-sm text-muted">
                      Ingen rabatt tilgjengelig. Gå videre til betaling.
                    </p>
                  )}
                  {allow?.friendFamilyEnabled && (
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDiscount(
                            String(
                              Math.round((gross * allow.friendFamilyPct) / 100),
                            ),
                          )
                        }
                        className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg hover:border-accent-soft"
                      >
                        Venn/familie −{allow.friendFamilyPct}%
                      </button>
                      {discountNum > 0 && (
                        <button
                          type="button"
                          onClick={() => setDiscount("")}
                          className="text-xs text-muted hover:text-fg hover:underline"
                        >
                          Nullstill
                        </button>
                      )}
                    </div>
                  )}
                  {allow?.discountAllowed && (
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold tracking-wide text-muted uppercase">
                        Rabatt (kr)
                      </label>
                      <input
                        value={discount}
                        onChange={(e) =>
                          setDiscount(e.target.value.replace(/[^0-9]/g, ""))
                        }
                        placeholder="0"
                        inputMode="numeric"
                        aria-label="Rabatt i kroner"
                        className="w-24 rounded-md border border-line bg-canvas px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted outline-none focus:border-accent-soft"
                      />
                    </div>
                  )}
                  <div className="mt-4 rounded-lg bg-canvas px-3 py-2">
                    {discountNum > 0 && (
                      <div className="mb-1 text-xs text-muted">
                        Sum {kr(gross)} · rabatt −{kr(discountNum)}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                        Å betale
                      </span>
                      <span className="font-display text-lg font-bold text-fg tabular-nums">
                        {kr(total)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Steg 5: Betaling */}
              {step === 5 && (
                <div>
                  {/* Oppsummering */}
                  <div className="mb-4 space-y-1 rounded-lg border border-line bg-canvas p-3 text-sm">
                    {barberName && (
                      <Row label="Barber" value={barberName} />
                    )}
                    {serviceName && <Row label="Behandling" value={serviceName} />}
                    {cartLines.length > 0 && (
                      <Row label="Varer" value={`${cartLines.length}`} />
                    )}
                    <Row
                      label="Kunde"
                      value={picked?.name || name.trim() || "Drop-in"}
                    />
                    {discountNum > 0 && (
                      <Row label="Rabatt" value={`−${kr(discountNum)}`} />
                    )}
                    <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5">
                      <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                        Å betale
                      </span>
                      <span className="font-display text-lg font-bold text-fg tabular-nums">
                        {kr(total)}
                      </span>
                    </div>
                  </div>

                  {!hasSomething && (
                    <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                      Velg en behandling eller minst én vare (gå tilbake).
                    </p>
                  )}

                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {split ? "Del betalingen:" : "Betalt med:"}
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
                        <div
                          key={m}
                          className="flex items-center justify-between gap-2"
                        >
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
                            className="w-28 rounded-md border border-line bg-canvas px-3 py-1.5 text-right text-sm text-fg outline-none focus:border-accent-soft"
                          />
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
                        <span className={splitOk ? "text-accent-soft" : "text-muted"}>
                          Fordelt: {kr(splitSum)} / {kr(total)}
                        </span>
                        <button
                          type="button"
                          disabled={pending || !hasSomething || !splitOk}
                          onClick={() => submit("", true)}
                          className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-accent-fg hover:opacity-90 disabled:opacity-40"
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
                          onClick={() => submit(p, false)}
                          className="flex-1 rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
                        >
                          {pending ? "…" : p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}
            </div>

            {/* Footer: Forrige / Neste */}
            <div className="flex items-center justify-between border-t border-line p-4">
              <button
                onClick={() => go(step - 1)}
                disabled={step === 0}
                className="rounded-md border border-line px-4 py-2 text-sm text-fg hover:border-accent-soft disabled:opacity-30"
              >
                ← Forrige
              </button>
              <span className="text-xs text-muted">
                Steg {step + 1} / {STEPS.length}
              </span>
              {canNext ? (
                <button
                  onClick={() => go(step + 1)}
                  className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-accent-fg hover:opacity-90"
                >
                  Neste →
                </button>
              ) : (
                <span className="w-[92px]" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}
