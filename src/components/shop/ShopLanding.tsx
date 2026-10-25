"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useShopData } from "@/components/shop/ShopShell";
import { ProductRow, ProductTile } from "@/components/shop/ProductTile";
import { useRecentlyViewed } from "@/components/shop/recent";
import { NEEDS, TAXONOMY, catUrl, deptOf, kr, type ShopProduct } from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * NETTBUTIKK – forsiden. Det som selger mest øverst (oppdateres av seg
 * selv etter hvert som vi selger), så det mest populære i hver kategori.
 * ===================================================================== */

export function ShopLanding() {
  const { products, bySlug, settings } = useShopData();
  const { lang } = useLanguage();
  const en = lang === "en";
  const t = (no: string, e: string) => (en ? e : no);
  const recent = useRecentlyViewed();

  const popular = useMemo(() => [...products].filter((p) => p.stock > 0).sort((a, b) => b.popularity - a.popularity), [products]);
  const top = popular.slice(0, 12);
  // «Bestselger» bare når produktet faktisk har solgt (salg teller 10 per stk).
  const bestsellers = new Set(top.filter((p) => p.popularity >= 30).slice(0, 4).map((p) => p.id));

  const byDept = useMemo(
    () =>
      TAXONOMY.map((d) => ({
        d,
        count: products.filter((p) => deptOf(p.category)?.key === d.key).length,
        items: popular.filter((p) => deptOf(p.category)?.key === d.key).slice(0, 10),
      })).filter((x) => x.count > 0),
    [products, popular],
  );
  const recentList = useMemo(() => recent.map((x) => bySlug.get(x)).filter(Boolean).slice(0, 8) as ShopProduct[], [recent, bySlug]);

  const usps = [
    settings.ship && settings.freeOverNok > 0 ? t(`Gratis frakt over ${kr(settings.freeOverNok)}`, `Free shipping over ${kr(settings.freeOverNok)}`) : null,
    settings.pickup ? t("Hent i salongen i Oslo", "Pick up in the salon") : null,
    t("Betal med Vipps", "Pay with Vipps"),
    t("14 dagers angrerett", "14-day returns"),
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-7xl px-5 pt-8 pb-24 sm:pt-10">
      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 rounded-2xl bg-surface px-4 py-3 text-[13px] text-fg-soft">
        {usps.map((u) => (
          <li key={u} className="flex items-center gap-1.5">
            <span aria-hidden className="text-accent-soft">
              ✓
            </span>
            {u}
          </li>
        ))}
      </ul>

      <header className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">{t("Mest populære", "Most popular")}</h1>
          <p className="mt-2 text-fg-soft">{t("Det kundene våre kjøper mest akkurat nå.", "What our customers are buying right now.")}</p>
        </div>
        <Link href={catUrl(null)} className="text-sm font-semibold underline">
          {t(`Se alle ${products.length} produkter`, `View all ${products.length} products`)}
        </Link>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
        {top.map((p, i) => (
          <ProductTile key={p.id} p={p} eager={i < 4} badge={bestsellers.has(p.id) ? t("Bestselger", "Bestseller") : undefined} />
        ))}
      </div>

      <section aria-labelledby="cats" className="mt-16">
        <h2 id="cats" className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("Handle etter kategori", "Shop by category")}
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {byDept.map(({ d, count }) => (
            <li key={d.key}>
              <Link
                href={catUrl(d.key)}
                className="group flex h-full flex-col rounded-2xl bg-surface p-5 transition-colors hover:bg-surface-2"
              >
                <span className="font-display text-2xl font-bold">{en ? d.en : d.no}</span>
                <span className="mt-1 text-[13px] text-muted tabular-nums">
                  {count} {t("produkter", "products")}
                </span>
                <span className="mt-4 text-sm font-semibold">
                  {t("Se alt", "Shop all")} <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {byDept
        .filter((x) => x.items.length >= 3)
        .map(({ d, items }) => (
          <ProductRow
            key={d.key}
            id={`pop-${d.key}`}
            title={t(`Populært i ${d.no.toLowerCase()}`, `Popular in ${d.en.toLowerCase()}`)}
            products={items}
            action={
              <Link href={catUrl(d.key)} className="shrink-0 text-sm font-semibold underline">
                {t("Se alt", "Shop all")}
              </Link>
            }
          />
        ))}

      <section aria-labelledby="needs" className="mt-16">
        <h2 id="needs" className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("Finn produktet ditt", "Find your product")}
        </h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          {NEEDS.map((n) => {
            const c = products.filter(n.match).length;
            if (!c) return null;
            return (
              <li key={n.key}>
                <Link
                  href={catUrl(null, null, `behov=${encodeURIComponent(n.key)}`)}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]"
                >
                  {en ? n.en : n.no}
                  <span className="text-xs text-muted tabular-nums">{c}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {recentList.length > 0 && <ProductRow id="recent" title={t("Nylig sett", "Recently viewed")} products={recentList} />}
    </main>
  );
}
