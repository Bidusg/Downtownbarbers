"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useShopData, CartButton } from "@/components/shop/ShopShell";
import { ProductRow, ProductTile } from "@/components/shop/ProductTile";
import { useRecentlyViewed } from "@/components/shop/recent";
import { CATEGORIES, CATEGORY_EN, kr, type ShopProduct } from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * NETTBUTIKK – katalog. Kategorier, søk, merke, sortering, favoritter
 * øverst og «Nylig sett» nederst (som de store nettbutikkene).
 * ===================================================================== */

type Sort = "rec" | "price-asc" | "price-desc" | "name";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function matches(p: ShopProduct, q: string) {
  if (!q) return true;
  const hay = norm([p.name, p.brand, p.category, p.short, p.recommendedFor].filter(Boolean).join(" "));
  return norm(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function Catalog({
  initialQuery,
  initialCategory,
  initialBrand,
}: {
  initialQuery: string;
  initialCategory: string;
  initialBrand: string;
}) {
  const { products, bySlug, settings } = useShopData();
  const { lang } = useLanguage();
  const en = lang === "en";
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState(initialCategory);
  const [brand, setBrand] = useState(initialBrand);
  const [sort, setSort] = useState<Sort>("rec");
  const [inStock, setInStock] = useState(false);
  const recent = useRecentlyViewed();

  // Hold adressefeltet i synk (deling av lenke / tilbake-knapp).
  useEffect(() => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (cat) sp.set("kategori", cat);
    if (brand) sp.set("merke", brand);
    const url = sp.size ? `/butikk?${sp}` : "/butikk";
    window.history.replaceState(null, "", url);
  }, [q, cat, brand]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.category) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);
  const cats = useMemo(
    () => [...CATEGORIES.filter((c) => counts.has(c)), ...[...counts.keys()].filter((c) => !(CATEGORIES as readonly string[]).includes(c))],
    [counts],
  );
  const brands = useMemo(
    () =>
      [...new Set(products.filter((p) => !cat || p.category === cat).map((p) => p.brand).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, "nb"),
      ),
    [products, cat],
  );

  const list = useMemo(() => {
    const l = products.filter(
      (p) => (!cat || p.category === cat) && (!brand || p.brand === brand) && (!inStock || p.stock > 0) && matches(p, q),
    );
    const s = [...l];
    if (sort === "price-asc") s.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") s.sort((a, b) => b.price - a.price);
    else if (sort === "name") s.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    // Anbefalt: favoritter, så på lager, så fast rekkefølge.
    else s.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.stock > 0) - Number(a.stock > 0));
    return s;
  }, [products, cat, brand, inStock, q, sort]);

  const filtered = !!(q || cat || brand || inStock);
  const featured = useMemo(() => products.filter((p) => p.featured && p.stock > 0).slice(0, 8), [products]);
  const recentList = useMemo(() => recent.map((s) => bySlug.get(s)).filter(Boolean).slice(0, 8) as ShopProduct[], [recent, bySlug]);
  const catLabel = (c: string) => (en ? CATEGORY_EN[c] ?? c : c);

  const usps = [
    settings.ship && settings.freeOverNok > 0
      ? en
        ? `Free shipping over ${kr(settings.freeOverNok)}`
        : `Gratis frakt over ${kr(settings.freeOverNok)}`
      : null,
    settings.pickup ? (en ? "Pick up in the salon" : "Hent i salongen i Oslo") : null,
    en ? "Pay with Vipps" : "Betal med Vipps",
    en ? "What our barbers use" : "Det barberne våre bruker",
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-7xl px-5 pt-8 pb-24 sm:pt-12">
      {/* Topp */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">{en ? "Online store" : "Nettbutikk"}</p>
          <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">{en ? "Shop" : "Butikk"}</h1>
        </div>
        <CartButton />
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
        {usps.map((u) => (
          <li key={u} className="flex items-center gap-1.5">
            <span aria-hidden className="text-accent-soft">
              ✓
            </span>
            {u}
          </li>
        ))}
      </ul>

      {/* Kategorier */}
      <nav aria-label={en ? "Categories" : "Kategorier"} className="mt-8">
        <div data-lenis-prevent className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {["", ...cats].map((c) => {
            const on = cat === c;
            return (
              <button
                key={c || "alle"}
                type="button"
                onClick={() => {
                  setCat(c);
                  setBrand("");
                }}
                aria-pressed={on}
                className={
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors " +
                  (on ? "bg-fg text-canvas" : "text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]")
                }
              >
                {c ? catLabel(c) : en ? "All" : "Alle"}
                <span className={"ml-1.5 text-xs tabular-nums " + (on ? "opacity-70" : "text-muted")}>{c ? counts.get(c) : products.length}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Verktøylinje */}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <label className="relative block">
          <span className="sr-only">{en ? "Search products" : "Søk i produkter"}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={en ? "Search wax, beard oil, brand …" : "Søk etter voks, skjeggolje, merke …"}
            className="h-11 w-full rounded-full bg-surface px-5 text-[15px] text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] outline-none placeholder:text-muted focus:shadow-[0_0_0_2px_oklch(var(--fg))]"
            autoComplete="off"
          />
        </label>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="h-11 rounded-full bg-surface px-4 text-sm text-fg shadow-[0_0_0_1px_oklch(var(--line-2))]"
          aria-label={en ? "Brand" : "Merke"}
        >
          <option value="">{en ? "All brands" : "Alle merker"}</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-11 rounded-full bg-surface px-4 text-sm text-fg shadow-[0_0_0_1px_oklch(var(--line-2))]"
          aria-label={en ? "Sort" : "Sorter"}
        >
          <option value="rec">{en ? "Recommended" : "Anbefalt"}</option>
          <option value="price-asc">{en ? "Price: low to high" : "Pris: lav til høy"}</option>
          <option value="price-desc">{en ? "Price: high to low" : "Pris: høy til lav"}</option>
          <option value="name">{en ? "Name A–Z" : "Navn A–Å"}</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span aria-live="polite">
          {list.length} {en ? (list.length === 1 ? "product" : "products") : "produkter"}
        </span>
        <span className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent-soft)]" />
            {en ? "In stock only" : "Bare på lager"}
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setCat("");
                setBrand("");
                setInStock(false);
              }}
              className="underline hover:text-fg"
            >
              {en ? "Clear filters" : "Nullstill"}
            </button>
          )}
        </span>
      </div>

      {/* Favoritter (bare uten filter) */}
      {!filtered && featured.length > 0 && (
        <ProductRow id="fav" title={en ? "Our barbers' favourites" : "Barbernes favoritter"} products={featured} />
      )}

      {/* Rutenett */}
      <section aria-label={en ? "Products" : "Produkter"} className="mt-10">
        {!filtered && <h2 className="mb-5 text-xl font-semibold tracking-tight sm:text-2xl">{en ? "All products" : "Alle produkter"}</h2>}
        {list.length === 0 ? (
          <div className="rounded-2xl bg-surface p-10 text-center">
            <p className="font-medium">{en ? "No products match your search." : "Ingen produkter passer søket ditt."}</p>
            <p className="mt-1 text-sm text-muted">
              {en ? "Try a different word, or ask us in the salon." : "Prøv et annet ord – eller spør oss i salongen, så hjelper vi deg."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {list.map((p, i) => (
              <ProductTile key={p.id} p={p} eager={i < 4} />
            ))}
          </div>
        )}
      </section>

      {recentList.length > 0 && <ProductRow id="recent" title={en ? "Recently viewed" : "Nylig sett"} products={recentList} />}

      {/* Hjelp */}
      <section className="mt-16 grid gap-6 rounded-3xl bg-surface p-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-10">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{en ? "Not sure what suits your hair?" : "Usikker på hva som passer håret ditt?"}</h2>
          <p className="mt-2 max-w-xl text-muted">
            {en
              ? "Ask your barber at your next visit – we'll show you how to use it, too."
              : "Spør barberen din neste gang du er innom – vi viser deg også hvordan du bruker produktet."}
          </p>
        </div>
        <Link href="/booking" className="pill pill-primary">
          {en ? "Book appointment" : "Bestill time"}
        </Link>
      </section>
    </main>
  );
}
