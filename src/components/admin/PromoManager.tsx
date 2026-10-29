"use client";

import { useState, useTransition } from "react";
import type { AdminPromo } from "@/lib/promo-admin-queries";
import { savePromo, togglePromo } from "@/app/admin/qr-tilbud/actions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Field } from "@/components/ui/Input";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";
const noDate = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "–");

function PromoForm({ p, onDone }: { p?: AdminPromo; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          setErr(null);
          const res = await savePromo(fd);
          if (res.error) return setErr(res.error);
          onDone();
        })
      }
      className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-3"
    >
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Internt navn" className="sm:col-span-3">
        <Input name="name" defaultValue={p?.name} placeholder="KPMG × Movember 2026" required />
      </Field>
      <Field label="Vises til kunden" className="sm:col-span-3">
        <Input name="label" defaultValue={p?.label} placeholder="KPMG × Movember" required />
      </Field>
      <Field label="Overskrift på tilbudssiden" className="sm:col-span-3">
        <Input name="headline" defaultValue={p?.headline ?? ""} placeholder="Takk for at du støttet Movember" />
      </Field>
      <Field label="Tekst på tilbudssiden" className="sm:col-span-3">
        <Input name="body" defaultValue={p?.body ?? ""} placeholder="Som takk får du et eget tilbud hos oss …" />
      </Field>
      <Field label="Rabatt på egen time (%)">
        <Input name="service_pct" type="number" min={0} max={100} inputMode="numeric" defaultValue={p?.servicePct ?? 20} />
      </Field>
      <Field label="Rabatt til venn (%)" hint="Booket sammen («Vi er flere personer»)">
        <Input name="friend_pct" type="number" min={0} max={100} inputMode="numeric" defaultValue={p?.friendPct ?? 50} />
      </Field>
      <Field label="Rabatt på produkter (%)">
        <Input name="product_pct" type="number" min={0} max={100} inputMode="numeric" defaultValue={p?.productPct ?? 15} />
      </Field>
      <Field label="Book innen">
        <Input name="book_by" type="date" defaultValue={p?.bookBy ?? ""} />
      </Field>
      <Field label="Timen senest">
        <Input name="visit_by" type="date" defaultValue={p?.visitBy ?? ""} />
      </Field>
      <Field label="Produktrabatt på nett til">
        <Input name="products_until" type="date" defaultValue={p?.productsUntil ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-fg sm:col-span-3">
        <input type="checkbox" name="once_per_customer" defaultChecked={p ? p.oncePerCustomer : true} />
        Én gang per kunde
      </label>
      {err && <p className="text-sm text-danger sm:col-span-3">{err}</p>}
      <div className="flex gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Lagrer …" : p ? "Lagre" : "Lag QR-tilbud"}
        </Button>
        <Button type="button" variant="link" onClick={onDone}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}

function PromoRow({ p }: { p: AdminPromo }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const perks = [
    p.servicePct > 0 && `−${p.servicePct}% time`,
    p.friendPct > 0 && `−${p.friendPct}% venn`,
    p.productPct > 0 && `−${p.productPct}% produkter`,
  ].filter(Boolean) as string[];

  return (
    <div className={"border border-line p-5 " + (p.active ? "bg-surface" : "bg-surface/40 opacity-70")}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0">
          <div
            className="h-40 w-40 bg-white p-1 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: p.qrSvg }}
          />
          <div className="mt-2 flex gap-3 text-xs font-semibold">
            <a href={p.qrPng} download={`qr-${p.slug}.png`} className="text-fg underline">
              PNG
            </a>
            <a
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.qrSvg)}`}
              download={`qr-${p.slug}.svg`}
              className="text-fg underline"
            >
              SVG (trykk)
            </a>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display font-semibold text-fg">{p.name}</span>
            {perks.map((x) => (
              <Badge key={x} tone="accent">
                {x}
              </Badge>
            ))}
            {!p.active && <Badge tone="neutral">Av</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted">
            Book innen {noDate(p.bookBy)} · time senest {noDate(p.visitBy)} · produkter på nett til{" "}
            {noDate(p.productsUntil)} · {p.oncePerCustomer ? "én gang per kunde" : "flere ganger"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="truncate font-mono text-fg">{p.url}</span>
            <Button
              type="button"
              variant="link"
              className="text-xs font-semibold"
              onClick={() => {
                navigator.clipboard?.writeText(p.url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "Kopiert" : "Kopier lenke"}
            </Button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {[
              ["Skanninger", p.scans],
              ["Bookinger", p.stats.bookings],
              ["Personer", p.stats.people],
              ["Gjennomført", p.stats.completed],
              ["Nettordrer", p.stats.orders ? `${p.stats.orders} · ${kr(p.stats.orderNok)}` : 0],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-4">
            <Button
              type="button"
              variant="link"
              className="text-xs font-semibold"
              disabled={pending}
              onClick={() => start(() => togglePromo(p.id, !p.active))}
            >
              {p.active ? "Slå av" : "Slå på"}
            </Button>
            <Button type="button" variant="link" className="text-xs font-semibold" onClick={() => setEditing((o) => !o)}>
              {editing ? "Lukk" : "Rediger"}
            </Button>
          </div>
        </div>
      </div>
      {editing && (
        <div className="mt-5">
          <PromoForm p={p} onDone={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}

export function PromoManager({ promos }: { promos: AdminPromo[] }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {creating ? (
        <PromoForm onDone={() => setCreating(false)} />
      ) : (
        <Button type="button" onClick={() => setCreating(true)}>
          Nytt QR-tilbud
        </Button>
      )}
      {promos.length === 0 && !creating ? (
        <EmptyState title="Ingen QR-tilbud ennå" description="Lag et tilbud og skriv ut QR-koden til arrangementet." />
      ) : (
        promos.map((p) => <PromoRow key={p.id} p={p} />)
      )}
    </div>
  );
}
