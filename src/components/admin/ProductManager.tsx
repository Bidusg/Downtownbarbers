"use client";

import { searchList } from "@/lib/search";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { WebProductEditor } from "@/components/admin/WebshopAdmin";
import { deptOf, subOf } from "@/lib/shop-shared";
import type { AdminProduct } from "@/lib/admin-queries";
import {
  createProduct,
  updateProduct,
  toggleProduct,
  deleteProduct,
  setProductBarcode,
} from "@/app/admin/produkter/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatKr } from "@/lib/format";
import type { ProductCost } from "@/app/admin/produkter/costs";
import { PriceCalculator } from "@/components/admin/PriceCalculator";
import { calcPrice } from "@/lib/pricing";

const MARGIN_CLS: Record<string, string> = {
  tap: "text-danger font-medium",
  lav: "text-amber-600 dark:text-amber-400 font-medium",
};

/** Inline strekkode-celle: vis/sett/endre strekkode, med skann-mulighet. */
function BarcodeCell({
  id,
  barcode,
}: {
  id: string;
  barcode: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  const save = (code: string) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      const r = await setProductBarcode(id, code);
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      } else {
        setMsg("Lagret ✓");
        setOpen(false);
      }
    });

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <span className={barcode ? "font-mono text-xs text-fg" : "text-xs text-muted"}>
          {barcode || "—"}
        </span>
        <Button
          variant="link"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className="text-xs"
        >
          {barcode ? "Endre" : "Sett"}
        </Button>
        {msg && !err && <span className="text-xs text-muted">{msg}</span>}
      </div>
    );
  }
  return (
    <div className="w-64 space-y-1">
      <BarcodeScanner onScan={save} autoFocus />
      {pending && <p className="text-xs text-muted">Lagrer …</p>}
      {msg && err && <p className="text-xs text-danger">{msg}</p>}
      <Button
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setMsg(null);
        }}
        className="act"
      >
        Avbryt
      </Button>
    </div>
  );
}

/** Inline redigeringsskjema: endre navn/pris/beskrivelse og evt. bytt bilde. */
function EditProductForm({
  product,
  cost,
  costsOk,
  onDone,
}: {
  product: AdminProduct;
  cost?: ProductCost;
  costsOk: boolean;
  onDone: () => void;
}) {
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startSave(async () => {
          setErr(null);
          const res = await updateProduct(fd);
          if (res.error) setErr(res.error);
          else if (res.warning) setErr(`Produktet er lagret. ${res.warning}`);
          else onDone();
        })
      }
      className="grid gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={product.id} />
      <Input name="name" placeholder="Navn" defaultValue={product.name} required />
      <Input
        name="description"
        placeholder="Beskrivelse"
        defaultValue={product.description ?? ""}
        className="sm:col-span-2"
      />
      <PriceCalculator
        defaultPrice={product.price_nok}
        defaultStock={product.stock}
        cost={cost}
        costsOk={costsOk}
      />
      <label className="text-xs text-muted sm:col-span-2">
        Bilde
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.name}
            className="mt-1 h-16 w-16 rounded object-cover"
          />
        )}
        <span className="mt-1 block">
          {product.image_url ? "Bytt bilde (valgfritt)" : "Last opp bilde (valgfritt)"}
        </span>
        <input name="image" type="file" accept="image/*" className="mt-1 block w-full text-xs" />
      </label>
      {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Lagrer …" : "Lagre endringer"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} className="px-4 py-2 text-sm">
          Avbryt
        </Button>
      </div>
    </form>
  );
}

export function ProductManager({
  products,
  costs = {},
  costsOk = false,
}: {
  products: AdminProduct[];
  costs?: Record<string, ProductCost>;
  costsOk?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ id: string; msg: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [webId, setWebId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "noimg" | "offline" | "nocat">("all");
  // ?rediger=<id> åpner redigering av den varen og ruller den inn i bildet.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("rediger");
    if (!id || !products.some((p) => p.id === id)) return;
    const t = setTimeout(() => {
      setEditId(id);
      setWebId(null);
      requestAnimationFrame(() => {
        const el = document.getElementById(`produkt-${id}`);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      });
    }, 0);
    return () => clearTimeout(t);
    // kun ved første innlasting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hasWeb = products.some((p) => p.slug !== undefined);
  const imgCount = (p: AdminProduct) => ((p.images ?? []).length || (p.image_url ? 1 : 0));
  const shown = useMemo(() => {
    const hits = searchList(products, q, (p) => ({
      text: [p.name, p.web_name, p.brand, deptOf(p.category)?.no],
      digits: [p.barcode],
    }));
    return hits.filter((p) => {
      if (filter === "review") return !!p.content_review;
      if (filter === "noimg") return !p.is_gift_card && imgCount(p) === 0;
      if (filter === "offline") return !p.is_gift_card && (p.online === false || !p.slug);
      if (filter === "nocat") return !p.is_gift_card && !p.subcategory;
      return true;
    });
  }, [products, q, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søk produkt, merke, strekkode …"
            className="h-9 w-64 rounded-lg border border-line-2 bg-canvas px-3 text-sm"
          />
          {hasWeb &&
            (
              [
                ["all", `Alle (${products.length})`],
                ["review", `Sjekk tekst (${products.filter((p) => p.content_review).length})`],
                ["noimg", `Mangler bilde (${products.filter((p) => !p.is_gift_card && imgCount(p) === 0).length})`],
                ["offline", "Ikke på nett"],
                ["nocat", "Mangler kategori"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={filter === k ? "act act-accent" : "act"}>
                {l}
              </button>
            ))}
        </div>
        <Button
          onClick={() => {
            setErr(null);
            setOpen((o) => !o);
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Nytt produkt"}
        </Button>
      </div>

      {open && (
        <Card>
          <form
            action={(fd) =>
              startSave(async () => {
                setErr(null);
                const res = await createProduct(fd);
                if (res.error) setErr(res.error);
                else if (res.warning) {
                  setErr(`Produktet er lagret. ${res.warning}`);
                } else setOpen(false);
              })
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <Input name="name" placeholder="Navn" required />
            <Input name="barcode" placeholder="Strekkode (valgfritt)" />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input name="is_gift_card" type="checkbox" /> Gavekort
            </label>
            <Input name="description" placeholder="Beskrivelse" className="sm:col-span-2" />
            <PriceCalculator defaultStock={0} costsOk={costsOk} showStock />
            <label className="text-xs text-muted sm:col-span-2">
              Bilde
              <input name="image" type="file" accept="image/*" className="mt-1 block w-full text-xs" />
            </label>
            {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
            <Button type="submit" disabled={saving} className="px-4 py-2 text-sm sm:col-span-2">
              {saving ? "Lagrer …" : "Lagre produkt"}
            </Button>
          </form>
        </Card>
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head className="bg-surface-2 uppercase tracking-wide">
              <Th>Produkt</Th>
              <Th>Pris</Th>
              <Th>Innkjøp</Th>
              <Th>Margin</Th>
              <Th>Lager</Th>
              <Th>Strekkode</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {shown.length === 0 && (
              <TableEmpty colSpan={9}>
                Ingen produkter enda – legg til det første, eller koble til databasen.
              </TableEmpty>
            )}
            {shown.map((p) => (
              <Fragment key={p.id}>
              <Tr>
                <Td className="font-medium text-fg" id={`produkt-${p.id}`}>
                  <span className="flex items-center gap-3">
                    {p.image_url || (p.images ?? [])[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(p.images ?? [])[0] ?? p.image_url ?? ""} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-9 w-9 shrink-0 rounded bg-surface-2" aria-hidden />
                    )}
                    <span>
                      {p.name}
                      {hasWeb && !p.is_gift_card && (
                        <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-normal">
                          {p.brand && <span className="text-muted">{p.brand}</span>}
                          {deptOf(p.category) && (
                            <span className="text-muted">
                              · {deptOf(p.category)!.no}
                              {subOf({ category: p.category ?? null, subcategory: p.subcategory ?? null })
                                ? ` › ${subOf({ category: p.category ?? null, subcategory: p.subcategory ?? null })!.no}`
                                : ""}
                            </span>
                          )}
                          {p.content_review && <span className="text-accent-soft">• Sjekk tekst</span>}
                          {imgCount(p) === 0 && <span className="text-muted">• Mangler bilde</span>}
                          {(p.online === false || !p.slug) && <span className="text-muted">• Ikke på nett</span>}
                        </span>
                      )}
                    </span>
                  </span>
                </Td>
                <Td className="font-display">{formatKr(p.price_nok)}</Td>
                <Td muted>
                  {!costsOk || !costs[p.id] ? "—" : `${costs[p.id].cost_nok.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} kr`}
                </Td>
                {(() => {
                  const c =
                    costsOk && !p.is_gift_card && costs[p.id]
                      ? calcPrice({ priceInkl: p.price_nok, cost: costs[p.id].cost_nok })
                      : null;
                  const m = c?.margin ?? null;
                  return (
                    <Td muted={!c || !MARGIN_CLS[c.level]} className={c ? MARGIN_CLS[c.level] : undefined}>
                      <span className="tabular-nums">
                        {m === null ? "—" : `${(m * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`}
                      </span>
                      {c && (c.level === "tap" || c.level === "lav") && (
                        <span className="ml-1 text-[11px]">{c.level === "tap" ? "Under innkjøp" : "Lav"}</span>
                      )}
                    </Td>
                  );
                })()}
                <Td muted>{p.stock}</Td>
                <Td>
                  <BarcodeCell id={p.id} barcode={p.barcode} />
                </Td>
                <Td muted>{p.is_gift_card ? "Gavekort" : "Produkt"}</Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={"text-xs " + (p.active ? "text-accent-soft" : "text-muted")}>
                      {p.active ? "Aktiv" : "Skjult"}
                    </span>
                    <button
                      onClick={() =>
                        start(async () => {
                          setRowErr(null);
                          const res = await toggleProduct(p.id, !p.active);
                          if (res.error) setRowErr({ id: p.id, msg: res.error });
                        })
                      }
                      disabled={pending}
                      className={p.active ? "act" : "act act-accent"}
                    >
                      {p.active ? "Deaktiver" : "Aktiver"}
                    </button>
                  </span>
                  {rowErr?.id === p.id && (
                    <p className="mt-1 text-xs text-danger">{rowErr.msg}</p>
                  )}
                </Td>
                <Td align="right">
                  <span className="flex items-center justify-end gap-2">
                    {hasWeb && !p.is_gift_card && (
                      <button
                        onClick={() => {
                          setEditId(null);
                          setWebId((id) => (id === p.id ? null : p.id));
                        }}
                        className={webId === p.id ? "act act-accent" : "act"}
                      >
                        {webId === p.id ? "Lukk" : "Nettbutikk"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRowErr(null);
                        setWebId(null);
                        setEditId((id) => (id === p.id ? null : p.id));
                      }}
                      className={editId === p.id ? "act act-accent" : "act"}
                    >
                      {editId === p.id ? "Lukk" : "Rediger"}
                    </button>
                    <ConfirmButton
                      label="Slett"
                      confirmLabel="Ja, slett"
                      pendingLabel="Sletter …"
                      disabled={pending}
                      onConfirm={() => deleteProduct(p.id)}
                    />
                  </span>
                </Td>
              </Tr>
              {webId === p.id && (
                <Tr>
                  <Td colSpan={9}>
                    <WebProductEditor product={p} onDone={() => setWebId(null)} />
                  </Td>
                </Tr>
              )}
              {editId === p.id && (
                <Tr>
                  <Td colSpan={9}>
                    <EditProductForm product={p} cost={costs[p.id]} costsOk={costsOk} onDone={() => setEditId(null)} />
                  </Td>
                </Tr>
              )}
              </Fragment>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
