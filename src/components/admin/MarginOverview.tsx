"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { StatTile } from "@/components/ui/StatTile";
import { LEVEL_LABEL, LOW_MARGIN, calcPrice, type MarginLevel, type PriceCalc } from "@/lib/pricing";

export type MarginRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  priceInkl: number;
  stock: number;
  active: boolean;
  cost: number | null;
  source: "manuell" | "import" | "anslag" | null;
  note: string | null;
};

type Calced = MarginRow & { c: PriceCalc };
type SortKey =
  | "name"
  | "brand"
  | "category"
  | "stock"
  | "cost"
  | "priceInkl"
  | "priceEks"
  | "profit"
  | "margin"
  | "markup"
  | "svCost"
  | "svRetail"
  | "source";

const kr = (n: number | null, d = 0) =>
  n === null ? "–" : n.toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d }) + " kr";
const pct = (n: number | null) =>
  n === null ? "–" : (n * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 }) + " %";

const LEVEL_TONE: Record<MarginLevel, BadgeTone> = {
  mangler: "neutral",
  tap: "danger",
  lav: "warning",
  ok: "success",
  høy: "accent",
};
const LEVEL_SHORT: Record<MarginLevel, string> = {
  mangler: "Mangler",
  tap: "Tap",
  lav: "Lav",
  ok: "OK",
  høy: "Høy",
};

const lc = (s: string | null) => (s === null ? null : s.toLocaleLowerCase("nb-NO"));

function sortVal(r: Calced, k: SortKey): string | number | null {
  switch (k) {
    case "name":
      return lc(r.name);
    case "brand":
      return lc(r.brand);
    case "category":
      return lc(r.category);
    case "stock":
      return r.stock;
    case "cost":
      return r.c.cost;
    case "priceInkl":
      return r.c.priceInkl;
    case "priceEks":
      return r.c.priceEks;
    case "profit":
      return r.c.profit;
    case "margin":
      return r.c.margin;
    case "markup":
      return r.c.markup;
    case "svCost":
      return r.c.stockValueCost;
    case "svRetail":
      return r.c.stockValueRetail;
    case "source":
      return r.source;
  }
}

function SortTh({
  k,
  sort,
  onSort,
  children,
  right,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  children: string;
  right?: boolean;
}) {
  return (
    <th
      scope="col"
      aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={"whitespace-nowrap px-3 py-2 font-medium " + (right ? "text-right" : "text-left")}
    >
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-fg">
        {children}
        <span aria-hidden className="w-3 text-[10px]">
          {sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

const CHIPS: [string, string][] = [
  ["tap", "Tap"],
  ["lav", "Lav margin (<40 %)"],
  ["mangler", "Mangler innkjøpspris"],
  ["anslag", "Anslag"],
];

export function MarginOverview({ rows }: { rows: MarginRow[] }) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [chips, setChips] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  const all = useMemo<Calced[]>(
    () => rows.map((r) => ({ ...r, c: calcPrice({ priceInkl: r.priceInkl, cost: r.cost, stock: r.stock }) })),
    [rows],
  );
  const brands = useMemo(
    () => [...new Set(rows.map((r) => r.brand).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "nb-NO")),
    [rows],
  );
  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "nb-NO")),
    [rows],
  );

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("nb-NO");
    const f = all.filter((r) => {
      if (onlyActive && !r.active) return false;
      if (brand && r.brand !== brand) return false;
      if (category && r.category !== category) return false;
      if (needle && !(lc(r.name)!.includes(needle) || (r.barcode ?? "").includes(needle))) return false;
      if (chips.tap && r.c.level !== "tap") return false;
      if (chips.lav && !(r.c.margin !== null && r.c.margin < LOW_MARGIN)) return false;
      if (chips.mangler && r.c.cost !== null) return false;
      if (chips.anslag && r.source !== "anslag") return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      const x = sortVal(a, sort.key);
      const y = sortVal(b, sort.key);
      if (x === null && y === null) return 0;
      if (x === null) return 1; // tomme sist, uansett retning
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "nb-NO") * dir;
    });
  }, [all, q, brand, category, onlyActive, chips, sort]);

  const tot = useMemo(() => {
    let inStock = 0;
    let stockSum = 0;
    let svCost = 0;
    let svInkl = 0;
    let svEks = 0;
    let potential = 0;
    let wProfit = 0;
    let wEks = 0;
    for (const r of list) {
      stockSum += r.c.stock;
      if (r.c.stock > 0) inStock++;
      svInkl += r.c.stockValueRetail ?? 0;
      svEks += r.c.stockValueRetailEks ?? 0;
      if (r.c.cost !== null && r.c.profit !== null && r.c.priceEks !== null) {
        svCost += r.c.stockValueCost ?? 0;
        potential += r.c.stock * r.c.profit;
        wProfit += r.c.profit * r.c.stock;
        wEks += r.c.priceEks * r.c.stock;
      }
    }
    return { inStock, stockSum, svCost, svInkl, svEks, potential, margin: wEks > 0 ? wProfit / wEks : null };
  }, [list]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const toggleChip = (k: string) => setChips((c) => ({ ...c, [k]: !c[k] }));
  const th = { sort, onSort: toggleSort };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Antall varer" value={list.length.toLocaleString("nb-NO")} sub={`${tot.inStock.toLocaleString("nb-NO")} på lager (lager over 0)`} />
        <StatTile label="Lagerverdi innkjøp" value={kr(tot.svCost)} sub="eks. mva, varer med innkjøpspris" />
        <StatTile label="Lagerverdi utsalg" value={kr(tot.svInkl)} sub={`${kr(tot.svEks)} eks. mva`} />
        <StatTile label="Potensiell fortjeneste" value={kr(tot.potential)} sub={`Snittmargin ${pct(tot.margin)} (vektet)`} />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="min-w-48 flex-1">
            <Input type="search" placeholder="Søk navn eller strekkode" aria-label="Søk" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Merke" className="w-auto" value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Alle merker</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <Select aria-label="Kategori" className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Alle kategorier</option>
            {categories.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <div className="flex gap-1" role="group" aria-label="Visning">
            <Button type="button" variant={onlyActive ? "primary" : "subtle"} className="px-3 py-2 text-sm" aria-pressed={onlyActive} onClick={() => setOnlyActive(true)}>
              Aktive
            </Button>
            <Button type="button" variant={!onlyActive ? "primary" : "subtle"} className="px-3 py-2 text-sm" aria-pressed={!onlyActive} onClick={() => setOnlyActive(false)}>
              Alle
            </Button>
          </div>
          <a
            href="/admin/rapporter/excel?r=varer-margin"
            download
            className="bo-btn inline-flex items-center justify-center rounded-lg border border-line-2 px-3 py-2 text-sm font-semibold text-fg hover:border-accent-soft [@media(pointer:coarse)]:min-h-11"
          >
            Last ned Excel
          </a>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
          {CHIPS.map(([k, label]) => (
            <Button key={k} type="button" variant={chips[k] ? "primary" : "subtle"} className="px-3 py-1 text-xs" aria-pressed={!!chips[k]} onClick={() => toggleChip(k)}>
              {label}
            </Button>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1200px] text-sm tabular-nums">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line text-xs text-muted">
                <SortTh k="name" {...th}>Vare</SortTh>
                <SortTh k="brand" {...th}>Merke</SortTh>
                <SortTh k="category" {...th}>Kategori</SortTh>
                <SortTh k="stock" right {...th}>Lager</SortTh>
                <SortTh k="cost" right {...th}>Innkjøp</SortTh>
                <SortTh k="priceInkl" right {...th}>Utsalg inkl.</SortTh>
                <SortTh k="priceEks" right {...th}>Utsalg eks.</SortTh>
                <SortTh k="profit" right {...th}>Profitt</SortTh>
                <SortTh k="margin" right {...th}>Margin</SortTh>
                <SortTh k="markup" right {...th}>Påslag</SortTh>
                <SortTh k="svCost" right {...th}>Lagerverdi innkjøp</SortTh>
                <SortTh k="svRetail" right {...th}>Lagerverdi utsalg</SortTh>
                <SortTh k="source" {...th}>Kilde</SortTh>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="max-w-72 px-3 py-2">
                    <Link href={`/admin/produkter?rediger=${r.id}`} className="font-medium text-fg hover:underline">
                      {r.name}
                    </Link>
                    {!r.active && <span className="ml-2 text-xs text-muted">(inaktiv)</span>}
                  </td>
                  <td className="px-3 py-2 text-muted">{r.brand ?? "–"}</td>
                  <td className="px-3 py-2 text-muted">{r.category ?? "–"}</td>
                  <td
                    className={"px-3 py-2 text-right" + (r.stock < 0 ? " text-danger" : "")}
                    title={r.stock < 0 ? "Negativt lager – teller som 0 i lagerverdi" : undefined}
                  >
                    {r.stock.toLocaleString("nb-NO")}
                  </td>
                  <td className="px-3 py-2 text-right">{kr(r.c.cost, 2)}</td>
                  <td className="px-3 py-2 text-right">{kr(r.c.priceInkl, 2)}</td>
                  <td className="px-3 py-2 text-right">{kr(r.c.priceEks, 2)}</td>
                  <td className="px-3 py-2 text-right">{kr(r.c.profit, 2)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="mr-2 align-middle">
                      <Badge tone={LEVEL_TONE[r.c.level]}>
                        <span title={LEVEL_LABEL[r.c.level]}>{LEVEL_SHORT[r.c.level]}</span>
                      </Badge>
                    </span>
                    {pct(r.c.margin)}
                  </td>
                  <td className="px-3 py-2 text-right">{pct(r.c.markup)}</td>
                  <td className="px-3 py-2 text-right">{kr(r.c.stockValueCost)}</td>
                  <td className="px-3 py-2 text-right">{kr(r.c.stockValueRetail)}</td>
                  <td className="px-3 py-2" title={r.note ?? undefined}>
                    {r.source === "anslag" ? <Badge tone="warning">anslag</Badge> : <span className="text-muted">{r.source ?? "–"}</span>}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-muted">
                    Ingen varer matcher filtrene.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-surface-2 font-semibold">
              <tr className="border-t border-line">
                <td className="px-3 py-2" colSpan={3}>
                  Sum ({list.length.toLocaleString("nb-NO")} varer)
                </td>
                <td className="px-3 py-2 text-right" title="Sum av lager over 0 (negativt lager teller som 0)">{tot.stockSum.toLocaleString("nb-NO")}</td>
                <td colSpan={4} />
                <td className="px-3 py-2 text-right">{pct(tot.margin)}</td>
                <td />
                <td className="px-3 py-2 text-right">{kr(tot.svCost)}</td>
                <td className="px-3 py-2 text-right">{kr(tot.svInkl)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">
        Margin = profitt / utsalg eks. mva. Påslag = profitt / innkjøp. Lagerverdi innkjøp og fortjeneste regnes bare for varer med innkjøpspris. Negativt lager teller som 0.
      </p>
    </div>
  );
}
