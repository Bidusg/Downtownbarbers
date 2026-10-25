"use client";

import { useMemo, useState, useTransition } from "react";
import { cancelOrder, completeOrder, markOrderReady, pickItem, setItemMissing } from "@/app/kasse/nettordrer/actions";
import type { OnlineOrder, OnlineOrderItem } from "@/lib/online-order-queries";
import { formatKr } from "@/lib/format";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";

const STATUS: Record<OnlineOrder["status"], { label: string; cls: string }> = {
  new: { label: "Ny – ikke plukket", cls: "bg-accent-soft/15 text-accent-soft" },
  picking: { label: "Plukkes", cls: "bg-[oklch(75%_0.14_80/0.18)] text-[oklch(50%_0.12_70)]" },
  ready: { label: "Klar", cls: "bg-[oklch(68%_0.15_150/0.15)] text-[oklch(48%_0.13_150)]" },
  picked_up: { label: "Utlevert", cls: "bg-surface-2 text-muted" },
  shipped: { label: "Sendt", cls: "bg-surface-2 text-muted" },
  cancelled: { label: "Kansellert", cls: "bg-surface-2 text-muted line-through" },
};

const PAY: Record<OnlineOrder["payment_method"], string> = {
  vipps: "Vipps",
  card: "Kort via Vipps",
  pay_at_pickup: "Betales ved henting",
};

function when(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const btn =
  "rounded-lg border border-line-2 px-3 py-1.5 text-sm font-semibold text-fg hover:border-accent-soft disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";
const btnPrimary =
  "rounded-lg bg-accent-soft px-3 py-1.5 text-sm font-semibold text-[#1d1a17] hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11";

/** Kort pip ved skanning: høyt = riktig, lavt = feil. */
function beep(ok: boolean) {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1320 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.3));
    osc.onended = () => void ctx.close();
    if (!ok) navigator.vibrate?.(200);
  } catch {
    /* lyd er bare en bonus */
  }
}

/** Hvor mye er plukket (linjer som mangler teller ikke). */
export function pickProgress(items: OnlineOrderItem[]) {
  const need = items.reduce((a, i) => a + (i.qty - i.missing_qty), 0);
  const got = items.reduce((a, i) => a + Math.min(i.picked_qty, i.qty - i.missing_qty), 0);
  const done = items.every((i) => i.picked_qty + i.missing_qty >= i.qty);
  return { need, got, done };
}

function PickLine({
  i,
  editable,
  busy,
  onDelta,
  onMissing,
}: {
  i: OnlineOrderItem;
  editable: boolean;
  busy: boolean;
  onDelta: (d: 1 | -1) => void;
  onMissing: (m: boolean) => void;
}) {
  const want = i.qty - i.missing_qty;
  const full = i.picked_qty >= want && want > 0;
  const allMissing = want === 0;
  return (
    <li className={"flex flex-wrap items-center gap-3 px-3 py-2.5 " + (full ? "bg-[oklch(68%_0.15_150/0.07)]" : "")}>
      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line bg-white">
        {i.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.image} alt="" className="h-full w-full object-contain" loading="lazy" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={"block text-sm " + (allMissing ? "text-muted line-through" : "")}>
          <strong className="tabular-nums">{i.qty} ×</strong> {i.name}
        </span>
        <span className="block text-xs text-muted">
          {i.barcode ? `Strekkode ${i.barcode}` : "Ingen strekkode – bruk +"}
          {i.missing_qty > 0 && <span className="text-danger"> · {i.missing_qty} mangler (tatt ut av ordren)</span>}
        </span>
      </span>
      <span
        className={
          "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums " +
          (allMissing
            ? "bg-danger/10 text-danger"
            : full
              ? "bg-[oklch(68%_0.15_150/0.15)] text-[oklch(45%_0.13_150)]"
              : "bg-surface-2 text-muted")
        }
      >
        {allMissing ? "Mangler" : full ? "✓ Plukket" : `${i.picked_qty} av ${want}`}
      </span>
      {editable && (
        <span className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy || i.picked_qty === 0}
            onClick={() => onDelta(-1)}
            aria-label={`Ta bort én ${i.name}`}
            className="h-9 w-9 rounded-lg border border-line-2 text-lg leading-none disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            −
          </button>
          <button
            type="button"
            disabled={busy || full || allMissing}
            onClick={() => onDelta(1)}
            aria-label={`Plukk én ${i.name}`}
            className="h-9 w-9 rounded-lg border border-line-2 text-lg leading-none disabled:opacity-30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            +
          </button>
          {i.missing_qty > 0 ? (
            <button type="button" disabled={busy} onClick={() => onMissing(false)} className="ml-1 text-xs text-muted underline">
              Angre mangler
            </button>
          ) : (
            !full && (
              <button type="button" disabled={busy} onClick={() => onMissing(true)} className="ml-1 text-xs text-danger underline">
                Mangler
              </button>
            )
          )}
        </span>
      )}
    </li>
  );
}

function OrderCard({ o, pickingReady }: { o: OnlineOrder; pickingReady: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [tracking, setTracking] = useState(o.tracking_no ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const open = o.status === "new" || o.status === "picking" || o.status === "ready";
  const st = STATUS[o.status];
  const prog = pickProgress(o.items);
  const picking = pickingReady && (o.status === "new" || o.status === "picking");
  const editable = pickingReady && open;
  const readyLabel = o.delivery === "pickup" ? "Klar til henting" : "Pakket";

  const onScan = (code: string) =>
    start(async () => {
      const r = await pickItem(o.id, code);
      beep(!r.error);
      setScanMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `✓ ${r.msg}${r.done ? " – alt er plukket!" : ""}` });
      if (r.done) setScanning(false);
    });

  const run = (fn: () => Promise<{ ok?: true; error?: string }>) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (r.error) setErr(r.error);
    });

  return (
    <li className="bo-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            #{o.order_no} · {when(o.created_at)}
          </p>
          <p className="mt-0.5 text-lg font-semibold">{o.name}</p>
          <p className="text-sm text-muted">
            {o.phone && (
              <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="underline">
                {o.phone}
              </a>
            )}
            {o.phone && " · "}
            <a href={`mailto:${o.email}`} className="underline">
              {o.email}
            </a>
          </p>
        </div>
        <div className="text-right">
          <span className={"inline-block rounded-full px-2.5 py-1 text-xs font-semibold " + st.cls}>{st.label}</span>
          <p className="mt-2 font-display text-xl">{formatKr(Number(o.total_nok))}</p>
          <p className="text-xs text-muted">
            {PAY[o.payment_method]}
            {o.payment_method !== "pay_at_pickup" && (o.payment_status === "authorized" ? " · reservert" : o.payment_status === "paid" ? " · trukket" : "")}
          </p>
        </div>
      </div>

      {editable && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              Plukket {prog.got} av {prog.need}
            </span>
            {picking && (
              <button
                type="button"
                onClick={() => {
                  setScanMsg(null);
                  setScanning((v) => !v);
                }}
                className={scanning ? btn : btnPrimary}
              >
                {scanning ? "Lukk skanner" : o.status === "new" ? "Start plukking" : "Skann varer"}
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div
              className="h-full rounded-full bg-[oklch(62%_0.15_150)] transition-[width] duration-300"
              style={{ width: `${prog.need ? Math.round((prog.got / prog.need) * 100) : 0}%` }}
            />
          </div>
          {scanning && (
            <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
              <BarcodeScanner onScan={onScan} continuous />
              <p className="mt-1.5 text-xs text-muted">
                Strekkodeleser: klikk i feltet og skann. Kamera: skann én vare om gangen.
              </p>
            </div>
          )}
          {scanMsg && (
            <p role="status" className={"mt-2 text-sm font-medium " + (scanMsg.ok ? "text-[oklch(45%_0.13_150)]" : "text-danger")}>
              {scanMsg.text}
            </p>
          )}
        </div>
      )}

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
        {editable
          ? o.items.map((i) => (
              <PickLine
                key={i.id}
                i={i}
                editable
                busy={pending}
                onDelta={(d) =>
                  run(async () => {
                    const r = await pickItem(o.id, null, i.id, d);
                    return r.error ? { error: r.error } : { ok: true as const };
                  })
                }
                onMissing={(m) => run(() => setItemMissing(i.id, m))}
              />
            ))
          : o.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                <span className={i.qty - i.missing_qty === 0 ? "text-muted line-through" : ""}>
                  <strong className="tabular-nums">{i.qty - i.missing_qty || i.qty} ×</strong> {i.name}
                  {i.missing_qty > 0 && i.qty - i.missing_qty > 0 && (
                    <span className="text-xs text-muted"> ({i.missing_qty} manglet)</span>
                  )}
                </span>
                <span className="text-muted tabular-nums">{formatKr(Number(i.unit_price_nok) * (i.qty - i.missing_qty))}</span>
              </li>
            ))}
        {Number(o.discount_nok) > 0 && (
          <li className="flex justify-between px-3 py-2 text-muted">
            <span>Kundeklubb {o.member_tier ?? ""}</span>
            <span className="tabular-nums">−{formatKr(Number(o.discount_nok))}</span>
          </li>
        )}
        {Number(o.shipping_nok) > 0 && (
          <li className="flex justify-between px-3 py-2 text-muted">
            <span>Frakt</span>
            <span className="tabular-nums">{formatKr(Number(o.shipping_nok))}</span>
          </li>
        )}
      </ul>

      <p className="mt-3 text-sm">
        <span className="text-muted">Levering: </span>
        {o.delivery === "pickup" ? (
          <strong>Hentes i salongen</strong>
        ) : (
          <>
            <strong>Sendes</strong> – {o.address}, {o.postal_code} {o.city}
          </>
        )}
        {o.tracking_no && <span className="text-muted"> · Sporing: {o.tracking_no}</span>}
      </p>
      {o.note && <p className="mt-1 text-sm"><span className="text-muted">Melding: </span>{o.note}</p>}

      {open && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pickingReady && (o.status === "new" || o.status === "picking") ? (
            <>
              <button
                type="button"
                disabled={pending || !prog.done || prog.need === 0}
                className={btnPrimary}
                onClick={() => run(() => markOrderReady(o.id))}
              >
                {readyLabel}
              </button>
              {!prog.done && <span className="text-xs text-muted">Skann eller merk alle varene først.</span>}
              {prog.done && prog.need === 0 && <span className="text-xs text-danger">Alt mangler – kanseller ordren.</span>}
            </>
          ) : !pickingReady && o.status === "new" && o.delivery === "pickup" ? (
            <button type="button" disabled={pending} className={btnPrimary} onClick={() => run(() => markOrderReady(o.id))}>
              Klar til henting
            </button>
          ) : o.delivery === "ship" ? (
            <>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Sporingsnummer (Posten)"
                className="h-9 w-56 rounded-lg border border-line-2 bg-canvas px-3 text-sm [@media(pointer:coarse)]:h-11"
              />
              <button type="button" disabled={pending} className={btnPrimary} onClick={() => run(() => completeOrder(o.id, null, tracking))}>
                Sendt
              </button>
            </>
          ) : o.payment_method === "pay_at_pickup" ? (
            <>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 rounded-lg border border-line-2 bg-canvas px-2 text-sm [@media(pointer:coarse)]:h-11" aria-label="Betalt med">
                <option value="">Betalt med …</option>
                <option>Kort</option>
                <option>Vipps</option>
                <option>Kontant</option>
              </select>
              <button type="button" disabled={pending || !method} className={btnPrimary} onClick={() => run(() => completeOrder(o.id, method, null))}>
                Utlevert og betalt ({formatKr(Number(o.total_nok))})
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} className={btnPrimary} onClick={() => run(() => completeOrder(o.id, null, null))}>
              Utlevert (trekk {formatKr(Number(o.total_nok))})
            </button>
          )}
          {confirmCancel ? (
            <>
              <button type="button" disabled={pending} className={btn + " text-danger"} onClick={() => run(() => cancelOrder(o.id))}>
                Ja, kanseller
              </button>
              <button type="button" className={btn} onClick={() => setConfirmCancel(false)}>
                Nei
              </button>
            </>
          ) : (
            <button type="button" className="ml-auto text-sm text-muted underline hover:text-fg" onClick={() => setConfirmCancel(true)}>
              Kanseller
            </button>
          )}
        </div>
      )}
      {pending && <p className="mt-2 text-sm text-muted">Lagrer …</p>}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </li>
  );
}

const isOpen = (r: OnlineOrder) => r.status === "new" || r.status === "picking" || r.status === "ready";

export function OnlineOrders({ rows, pickingReady = true }: { rows: OnlineOrder[]; pickingReady?: boolean }) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const open = useMemo(() => rows.filter(isOpen), [rows]);
  const closed = useMemo(() => rows.filter((r) => !isOpen(r)), [rows]);
  const list = tab === "open" ? open : closed;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ["open", `Åpne (${open.length})`],
            ["done", `Fullført / kansellert (${closed.length})`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={"rounded-full px-4 py-1.5 text-sm font-semibold " + (tab === k ? "bg-fg text-canvas" : "border border-line-2 text-fg")}>
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="bo-card border border-line bg-surface px-5 py-10 text-center text-sm text-muted">
          {tab === "open" ? "Ingen nettordrer som venter." : "Ingen fullførte nettordrer de siste 90 dagene."}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <OrderCard key={o.id} o={o} pickingReady={pickingReady} />
          ))}
        </ul>
      )}
    </div>
  );
}
