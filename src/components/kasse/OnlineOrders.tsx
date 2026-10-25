"use client";

import { useMemo, useState, useTransition } from "react";
import { cancelOrder, completeOrder, markOrderReady } from "@/app/kasse/nettordrer/actions";
import type { OnlineOrder } from "@/lib/online-order-queries";
import { formatKr } from "@/lib/format";

const STATUS: Record<OnlineOrder["status"], { label: string; cls: string }> = {
  new: { label: "Ny", cls: "bg-accent-soft/15 text-accent-soft" },
  ready: { label: "Klar til henting", cls: "bg-[oklch(68%_0.15_150/0.15)] text-[oklch(48%_0.13_150)]" },
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

function OrderCard({ o }: { o: OnlineOrder }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [tracking, setTracking] = useState(o.tracking_no ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = o.status === "new" || o.status === "ready";
  const st = STATUS[o.status];

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

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
        {o.items.map((i, k) => (
          <li key={k} className="flex justify-between gap-3 px-3 py-2">
            <span>
              <strong className="tabular-nums">{i.qty} ×</strong> {i.name}
            </span>
            <span className="text-muted tabular-nums">{formatKr(Number(i.line_total_nok))}</span>
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
          {o.status === "new" && o.delivery === "pickup" && (
            <button type="button" disabled={pending} className={btnPrimary} onClick={() => run(() => markOrderReady(o.id))}>
              Klar til henting
            </button>
          )}
          {o.delivery === "ship" ? (
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
              <button type="button" disabled={pending || !method} className={o.status === "ready" ? btnPrimary : btn} onClick={() => run(() => completeOrder(o.id, method, null))}>
                Utlevert og betalt
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} className={o.status === "ready" ? btnPrimary : btn} onClick={() => run(() => completeOrder(o.id, null, null))}>
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

export function OnlineOrders({ rows }: { rows: OnlineOrder[] }) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const open = useMemo(() => rows.filter((r) => r.status === "new" || r.status === "ready"), [rows]);
  const closed = useMemo(() => rows.filter((r) => !(r.status === "new" || r.status === "ready")), [rows]);
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
            <OrderCard key={o.id} o={o} />
          ))}
        </ul>
      )}
    </div>
  );
}
