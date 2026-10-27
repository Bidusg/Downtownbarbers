"use client";

import { useMemo, useState, useTransition } from "react";
import { OrderCard } from "@/components/kasse/OnlineOrders";
import { editOrder, returnOrder, addOrderNote } from "@/app/kasse/nettordrer/order-actions";
import type { OnlineOrder, OrderEvent, OrderFeatures, PickableProduct } from "@/lib/online-order-queries";
import { formatKr } from "@/lib/format";

/* =====================================================================
 * ORDRESIDE (kasse + admin)
 *   Åpen ordre:     plukking (samme kort som i listen) + «Endre ordre».
 *   Utlevert ordre: «Retur / reklamasjon / bytte».
 *   Alltid:         historikk og notat.
 * ===================================================================== */

const btn =
  "rounded-lg border border-line-2 px-3 py-1.5 text-sm font-semibold text-fg hover:border-accent-soft disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";
const btnPrimary =
  "rounded-lg bg-accent-soft px-3 py-1.5 text-sm font-semibold text-[#1d1a17] hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";
const inp = "h-9 rounded-lg border border-line-2 bg-canvas px-3 text-sm [@media(pointer:coarse)]:h-11";
const card = "bo-card border border-line bg-surface p-5";

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" aria-label={`Færre ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="h-8 w-8 rounded-lg border border-line-2 disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
        −
      </button>
      <span className="w-7 text-center tabular-nums">{value}</span>
      <button type="button" aria-label={`Flere ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="h-8 w-8 rounded-lg border border-line-2 disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
        +
      </button>
    </span>
  );
}

/** Søk/skann et produkt og legg det til. */
function ProductPicker({ products, onPick }: { products: PickableProduct[]; onPick: (p: PickableProduct) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return products.filter((p) => p.name.toLowerCase().includes(t) || (p.barcode ?? "") === t).slice(0, 8);
  }, [q, products]);
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const exact = products.find((p) => p.barcode && p.barcode === q.trim());
            const pick = exact ?? (hits.length === 1 ? hits[0] : null);
            if (pick) {
              onPick(pick);
              setQ("");
            }
          }
        }}
        placeholder="Søk eller skann vare …"
        aria-label="Søk etter vare"
        className={inp + " w-full"}
      />
      {hits.length > 0 && (
        <ul className="mt-1 divide-y divide-line rounded-lg border border-line bg-canvas text-sm">
          {hits.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={p.stock <= 0}
                onClick={() => {
                  onPick(p);
                  setQ("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-40"
              >
                <span>{p.name}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {formatKr(p.price_nok)} · {p.stock > 0 ? `${p.stock} på lager` : "utsolgt"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Endre åpen ordre ---------------- */
function EditPanel({ o, products }: { o: OnlineOrder; products: PickableProduct[] }) {
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(o.items.map((i) => [i.id, i.qty])));
  const [adds, setAdds] = useState<{ p: PickableProduct; qty: number }[]>([]);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const fullBefore = o.items.reduce((a, i) => a + i.unit_price_nok * i.qty, 0);
  const pct = fullBefore > 0 ? Number(o.discount_nok) / fullBefore : 0;
  const sub =
    o.items.reduce((a, i) => a + i.unit_price_nok * ((qty[i.id] ?? i.qty) - Math.min(i.missing_qty, qty[i.id] ?? i.qty)), 0) +
    adds.reduce((a, x) => a + x.p.price_nok * x.qty, 0);
  const newTotal = sub > 0 ? sub - Math.round(sub * pct) + Number(o.shipping_nok) : 0;
  const changes = o.items.filter((i) => (qty[i.id] ?? i.qty) !== i.qty).map((i) => ({ item: i.id, qty: qty[i.id] }));
  const dirty = changes.length > 0 || adds.length > 0;
  const cap = o.payment_method !== "pay_at_pickup" ? (o.authorized_nok ?? Number(o.total_nok)) : null;

  return (
    <section className={card} aria-labelledby="edit-h">
      <h2 id="edit-h" className="text-base font-semibold">Endre ordre</h2>
      <p className="mt-1 text-sm text-muted">
        Endre antall, fjern varer eller legg til nye. Lageret og totalen oppdateres.
        {cap != null && ` Betalt med Vipps/kort: totalen kan ikke bli høyere enn ${formatKr(cap)}, som kunden har godkjent.`}
      </p>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className={(qty[i.id] ?? i.qty) === 0 ? "text-muted line-through" : ""}>
              {i.name} <span className="text-muted">· {formatKr(i.unit_price_nok)}</span>
            </span>
            <span className="flex items-center gap-2">
              <Stepper value={qty[i.id] ?? i.qty} min={0} max={50} label={i.name} onChange={(n) => setQty({ ...qty, [i.id]: n })} />
              {(qty[i.id] ?? i.qty) > 0 && (
                <button type="button" className="text-xs text-danger underline" onClick={() => setQty({ ...qty, [i.id]: 0 })}>
                  Fjern
                </button>
              )}
            </span>
          </li>
        ))}
        {adds.map((x, k) => (
          <li key={x.p.id} className="flex flex-wrap items-center justify-between gap-3 bg-[oklch(68%_0.15_150/0.06)] px-3 py-2">
            <span>
              <strong className="text-xs text-[oklch(45%_0.13_150)]">NY</strong> {x.p.name} <span className="text-muted">· {formatKr(x.p.price_nok)}</span>
            </span>
            <span className="flex items-center gap-2">
              <Stepper
                value={x.qty}
                min={0}
                max={Math.min(50, x.p.stock)}
                label={x.p.name}
                onChange={(n) => setAdds(n === 0 ? adds.filter((_, j) => j !== k) : adds.map((a, j) => (j === k ? { ...a, qty: n } : a)))}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <ProductPicker
          products={products}
          onPick={(p) => {
            const existing = o.items.find((i) => i.product_id === p.id);
            if (existing) setQty({ ...qty, [existing.id]: (qty[existing.id] ?? existing.qty) + 1 });
            else if (adds.some((a) => a.p.id === p.id)) setAdds(adds.map((a) => (a.p.id === p.id ? { ...a, qty: a.qty + 1 } : a)));
            else setAdds([...adds, { p, qty: 1 }]);
          }}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Hvorfor? (vises i historikken)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="F.eks. kunden ringte og ville bytte størrelse" className={inp + " w-full"} />
        </label>
        <p className="text-sm">
          Ny total: <strong className="tabular-nums">{formatKr(newTotal)}</strong>
          <span className="text-muted"> (før {formatKr(Number(o.total_nok))})</span>
        </p>
      </div>
      {cap != null && newTotal > cap && (
        <p className="mt-2 text-sm text-danger">Over godkjent beløp ({formatKr(cap)}). Ta mellomlegget i kassa i stedet.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!dirty || pending || (cap != null && newTotal > cap)}
          className={btnPrimary}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await editOrder(o.id, changes, adds.map((a) => ({ product: a.p.id, qty: a.qty })), note, notify);
              if (r.error) setMsg({ ok: false, text: r.error });
              else {
                setMsg({ ok: true, text: "Ordren er endret ✓" });
                setAdds([]);
                setNote("");
              }
            })
          }
        >
          {pending ? "Lagrer …" : "Lagre endringene"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Send e-post til kunden
        </label>
        {msg && <span role="status" className={"text-sm " + (msg.ok ? "text-[oklch(45%_0.13_150)]" : "text-danger")}>{msg.text}</span>}
      </div>
    </section>
  );
}

/* ---------------- Retur / reklamasjon / bytte ---------------- */
type Kind = "retur" | "reklamasjon" | "bytte";
type Method = "Vipps" | "Kort" | "Kontant" | "";
/** Refusjon: Vipps-refusjon finnes ikke hos oss – gavekort er alternativet. */
type RefundMethod = "Gavekort" | "Kort" | "Kontant" | "";

function ReturnPanel({ o, products }: { o: OnlineOrder; products: PickableProduct[] }) {
  const [kind, setKind] = useState<Kind>("retur");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState(true);
  const [repl, setRepl] = useState<{ p: PickableProduct; qty: number }[]>([]);
  const [refundTouched, setRefundTouched] = useState<string | null>(null);
  const [method, setMethod] = useState<RefundMethod>("");
  const [giftCode, setGiftCode] = useState<string | null>(null);
  const [extraMethod, setExtraMethod] = useState<Method>("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const full = o.items.reduce((a, i) => a + i.unit_price_nok * i.qty, 0);
  const pct = full > 0 ? Number(o.discount_nok) / full : 0;
  const left = (i: OnlineOrder["items"][number]) => i.qty - i.missing_qty - i.returned_qty;
  const backValue = o.items.reduce((a, i) => a + i.unit_price_nok * (qty[i.id] ?? 0), 0);
  const backNet = Math.round(backValue * (1 - pct));
  const replValue = kind === "bytte" ? repl.reduce((a, x) => a + x.p.price_nok * x.qty, 0) : 0;
  const replNet = Math.round(replValue * (1 - pct));
  const remaining = Math.max(0, Number(o.total_nok) - o.refunded_nok);
  const suggestedRefund = Math.min(remaining, Math.max(0, backNet - replNet));
  const refund = refundTouched === null ? suggestedRefund : Math.max(0, Number(refundTouched) || 0);
  const extra = Math.max(0, replNet - backNet);
  const anyLines = Object.values(qty).some((n) => n > 0) || repl.length > 0;

  const chooseKind = (k: Kind) => {
    setKind(k);
    setRestock(k !== "reklamasjon");
    setRefundTouched(null);
    setConfirm(false);
  };

  const submit = () =>
    start(async () => {
      setMsg(null);
      const r = await returnOrder({
        id: o.id,
        kind,
        lines: Object.entries(qty).map(([item, n]) => ({ item, qty: n })),
        restock,
        refund,
        refundMethod: refund > 0 ? method : "",
        replacements: kind === "bytte" ? repl.map((x) => ({ product: x.p.id, qty: x.qty })) : [],
        extra,
        extraMethod: extra > 0 ? extraMethod : "",
        note,
        notifyCustomer: notify,
      });
      setConfirm(false);
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setGiftCode(r.giftCode ?? null);
        setMsg({
          ok: true,
          text: r.giftCode ? `Registrert ✓ – gavekort ${r.giftCode}` : "Registrert ✓",
        });
        setQty({});
        setRepl([]);
        setNote("");
        setRefundTouched(null);
      }
    });

  return (
    <section className={card} aria-labelledby="ret-h">
      <h2 id="ret-h" className="text-base font-semibold">Retur, reklamasjon eller bytte</h2>
      <p className="mt-1 text-sm text-muted">
        Velg varene kunden leverer tilbake. Refusjonen føres som et negativt salg, så kasseoppgjøret og regnskapet stemmer.
        {o.refunded_nok > 0 && ` Allerede refundert: ${formatKr(o.refunded_nok)}.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
        {(
          [
            ["retur", "Retur (angrerett)"],
            ["reklamasjon", "Reklamasjon (feil på varen)"],
            ["bytte", "Bytte"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => chooseKind(k)}
            className={"rounded-full px-4 py-1.5 text-sm font-semibold " + (kind === k ? "bg-fg text-canvas" : "border border-line-2 text-fg")}
          >
            {l}
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className={left(i) === 0 ? "text-muted" : ""}>
              {i.name} <span className="text-muted">· {formatKr(i.unit_price_nok)} · kjøpt {i.qty - i.missing_qty}</span>
              {i.returned_qty > 0 && <span className="text-xs text-danger"> · {i.returned_qty} allerede returnert</span>}
            </span>
            {left(i) > 0 ? (
              <Stepper value={qty[i.id] ?? 0} min={0} max={left(i)} label={i.name} onChange={(n) => { setQty({ ...qty, [i.id]: n }); setRefundTouched(null); }} />
            ) : (
              <span className="text-xs text-muted">Ingen igjen</span>
            )}
          </li>
        ))}
      </ul>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        Legg de returnerte varene tilbake på lager
        {kind === "reklamasjon" && <span className="text-xs text-muted">(ikke hvis varen er ødelagt)</span>}
      </label>

      {kind === "bytte" && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Kunden får i stedet</p>
          {repl.length > 0 && (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
              {repl.map((x, k) => (
                <li key={x.p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>
                    {x.p.name} <span className="text-muted">· {formatKr(x.p.price_nok)}</span>
                  </span>
                  <Stepper
                    value={x.qty}
                    min={0}
                    max={Math.min(50, x.p.stock)}
                    label={x.p.name}
                    onChange={(n) => setRepl(n === 0 ? repl.filter((_, j) => j !== k) : repl.map((a, j) => (j === k ? { ...a, qty: n } : a)))}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2">
            <ProductPicker
              products={products}
              onPick={(p) => setRepl(repl.some((a) => a.p.id === p.id) ? repl.map((a) => (a.p.id === p.id ? { ...a, qty: a.qty + 1 } : a)) : [...repl, { p, qty: 1 }])}
            />
          </div>
        </div>
      )}

      {/* Penger */}
      <div className="mt-5 grid gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted">Tilbake til kunden</p>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={remaining}
              step="1"
              value={refundTouched ?? String(suggestedRefund)}
              onChange={(e) => setRefundTouched(e.target.value)}
              aria-label="Refusjon i kroner"
              className={inp + " w-28 tabular-nums"}
            />
            <span>kr</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Foreslått {formatKr(suggestedRefund)}
            {pct > 0 && ` (etter ${Math.round(pct * 100)} % kundeklubbrabatt)`}. Maks {formatKr(remaining)}.
          </p>
          {refund > 0 && (
            <>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as RefundMethod)}
                aria-label="Refusjonsmåte"
                className={inp + " mt-2 w-full"}
              >
                <option value="">Betales tilbake med …</option>
                <option value="Gavekort">Gavekort / tilgodelapp</option>
                <option value="Kort">Kort i terminalen</option>
                <option value="Kontant">Kontant</option>
              </select>
              {method === "Gavekort" && (
                <p className="mt-1 text-xs text-muted">
                  Det utstedes et gavekort på {formatKr(refund)} uten utløpsdato. Koden vises her og
                  sendes kunden på e-post.
                  {kind === "retur" && (
                    <>
                      {" "}
                      <strong>Ved angrerett må kunden si ja til gavekort</strong> – ellers skal
                      pengene tilbake på kort eller kontant.
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
        {extra > 0 && (
          <div>
            <p className="text-xs font-medium text-muted">Mellomlegg kunden betaler</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatKr(extra)}</p>
            <select value={extraMethod} onChange={(e) => setExtraMethod(e.target.value as Method)} aria-label="Mellomlegg betalt med" className={inp + " mt-2 w-full"}>
              <option value="">Betalt med …</option>
              <option value="Kort">Kort</option>
              <option value="Vipps">Vipps</option>
              <option value="Kontant">Kontant</option>
            </select>
          </div>
        )}
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Notat (vises i historikken)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="F.eks. uåpnet, kunden angret / pumpen virket ikke" className={inp + " w-full"} />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!confirm ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={pending || !anyLines || (refund > 0 && !method) || (extra > 0 && !extraMethod) || refund > remaining}
            onClick={() => setConfirm(true)}
          >
            Registrer {kind}
          </button>
        ) : (
          <>
            <span className="text-sm font-semibold">
              {refund > 0
                ? `Betale tilbake ${formatKr(refund)}${
                    method === "Gavekort" ? " som gavekort" : ` (${method.toLowerCase()})`
                  }?`
                : extra > 0
                  ? `Kunden betaler ${formatKr(extra)} – registrere?`
                  : "Registrere uten pengeoverføring?"}
            </span>
            <button type="button" className={btnPrimary} disabled={pending} onClick={submit}>
              {pending ? "Lagrer …" : "Ja, registrer"}
            </button>
            <button type="button" className={btn} onClick={() => setConfirm(false)}>
              Avbryt
            </button>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Send bekreftelse til kunden
        </label>
        {msg && <span role="status" className={"text-sm " + (msg.ok ? "text-[oklch(45%_0.13_150)]" : "text-danger")}>{msg.text}</span>}
      </div>

      {giftCode && (
        <div className="mt-4 rounded-xl border border-line-2 bg-surface-2 p-4">
          <p className="text-xs font-medium text-muted">Gavekortkode til kunden</p>
          <p className="mt-1 font-display text-2xl font-bold tracking-widest tabular-nums">{giftCode}</p>
          <p className="mt-1 text-xs text-muted">
            Skriv den på en tilgodelapp, eller la kunden ta et bilde. Koden er også sendt på e-post
            og ligger under Gavekort i admin. Ingen utløpsdato.
          </p>
        </div>
      )}
    </section>
  );
}

/* ---------------- Historikk ---------------- */
const KIND: Record<string, string> = {
  edit: "Endret",
  return: "Retur",
  complaint: "Reklamasjon",
  exchange: "Bytte",
  note: "Notat",
};

function History({ o, events }: { o: OnlineOrder; events: OrderEvent[] }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const base: { at: string; label: string; text: string }[] = [
    { at: o.created_at, label: "Bestilt", text: `Ordre #${o.order_no} på ${formatKr(Number(o.total_nok) + o.refunded_nok)}` },
    ...(o.ready_at ? [{ at: o.ready_at, label: o.delivery === "pickup" ? "Klar" : "Pakket", text: "Plukket og klar" }] : []),
    ...(o.completed_at ? [{ at: o.completed_at, label: o.delivery === "pickup" ? "Utlevert" : "Sendt", text: "Salget er registrert" }] : []),
  ];
  const all = [
    ...events.map((e) => ({ at: e.created_at, label: KIND[e.kind] ?? e.kind, text: e.text + (e.by ? ` – ${e.by}` : "") })),
    ...base,
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <section className={card} aria-labelledby="hist-h">
      <h2 id="hist-h" className="text-base font-semibold">Historikk</h2>
      <ol className="mt-3 space-y-3 text-sm">
        {all.map((e, k) => (
          <li key={k} className="grid grid-cols-[7.5rem_1fr] gap-3">
            <span className="text-xs text-muted tabular-nums">{when(e.at)}</span>
            <span>
              <strong>{e.label}:</strong> {e.text}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv et notat (f.eks. kunden ringte)" aria-label="Notat" className={inp + " min-w-0 flex-1"} />
        <button
          type="button"
          className={btn}
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await addOrderNote(o.id, text);
              if (r.error) setErr(r.error);
              else setText("");
            })
          }
        >
          Lagre notat
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </section>
  );
}

export function OrderDetail({
  o,
  events,
  features,
  products,
  basePath,
  customerHref,
}: {
  o: OnlineOrder;
  events: OrderEvent[];
  features: OrderFeatures;
  products: PickableProduct[];
  basePath: string;
  customerHref?: string | null;
}) {
  const open = o.status === "new" || o.status === "picking" || o.status === "ready";
  const done = o.status === "picked_up" || o.status === "shipped";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <a href={basePath} className="text-muted underline">
          ← Alle nettordrer
        </a>
        {customerHref && (
          <a href={customerHref} className="font-semibold text-accent-soft underline">
            Kundekortet til {o.name} →
          </a>
        )}
      </div>
      <OrderCard o={o} pickingReady={features.picking} as="div" />
      {!features.returns ? (
        <p className={card + " text-sm text-danger"}>Kjør KJØR-I-SUPABASE-NETTORDRE-RETUR.sql i Supabase for å endre ordrer og registrere retur.</p>
      ) : (
        <>
          {open && <EditPanel key={o.items.map((i) => i.id + i.qty).join()} o={o} products={products} />}
          {done && <ReturnPanel key={o.items.map((i) => i.id + i.returned_qty).join() + o.refunded_nok} o={o} products={products} />}
          <History o={o} events={events} />
        </>
      )}
    </div>
  );
}
