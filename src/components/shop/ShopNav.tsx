"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CartButton, useShopData } from "@/components/shop/ShopShell";
import { ProductImage } from "@/components/shop/ProductTile";
import {
  NEEDS,
  TAXONOMY,
  catUrl,
  deptOf,
  kr,
  type Dept,
  type ShopProduct,
} from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { searchList } from "@/lib/search";

/* =====================================================================
 * BUTIKK-MENY (som ASOS / Zalando / Zara)
 *   PC: kategoriene ligger på toppen; hold musa over (eller trykk) for en
 *   nedtrekksmeny med produkttyper, behov og det mest populære i
 *   kategorien. Trykk på kategorien → bare varene i den.
 *   Mobil: kategorirad + «Kategorier»-knapp som åpner en fullskjermsmeny.
 * ===================================================================== */

type Menu = string | null; // dept-nøkkel, «merker» eller null

export function ShopNav() {
  const { products } = useShopData();
  const { lang } = useLanguage();
  const en = lang === "en";
  const t = (no: string, e: string) => (en ? e : no);
  const path = usePathname() ?? "";
  const router = useRouter();
  const [menu, setMenu] = useState<Menu>(null);
  const [sheet, setSheet] = useState(false);
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<"desk" | "mob" | null>(null);
  // Treff mens man skriver (tilgivende: starten av ord + små skrivefeil).
  const hits = useMemo(
    () =>
      q.trim()
        ? searchList(
            products.filter((p) => !p.isGiftCard),
            q,
            (p) => ({ text: [p.name, p.brand, deptOf(p.category)?.no, p.tags.join(" ")] }),
          ).slice(0, 6)
        : [],
    [q, products],
  );
  const timer = useRef<number | null>(null);

  const activeDept = path.match(/^\/butikk\/kategori\/([^/?]+)/)?.[1] ?? null;

  const stats = useMemo(() => {
    const dept = new Map<string, number>();
    const sub = new Map<string, number>();
    const brands = new Map<string, number>();
    for (const p of products) {
      const d = deptOf(p.category)?.key;
      if (d) dept.set(d, (dept.get(d) ?? 0) + 1);
      if (d && p.subcategory)
        sub.set(
          `${d}/${p.subcategory}`,
          (sub.get(`${d}/${p.subcategory}`) ?? 0) + 1,
        );
      if (p.brand) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
    }
    return {
      dept,
      sub,
      brands: [...brands.entries()].sort((a, b) =>
        a[0].localeCompare(b[0], "nb"),
      ),
    };
  }, [products]);
  const depts = TAXONOMY.filter((d) => stats.dept.has(d.key));

  // Lukk menyene ved navigasjon og med Esc.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lukk menyen når siden byttes
    setMenu(null);
    setSheet(false);
  }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setSheet(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  const openSoon = (m: Menu) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMenu(m), menu ? 0 : 120);
  };
  const closeSoon = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMenu(null), 180);
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    router.push(catUrl(null, null, `q=${encodeURIComponent(v)}`));
    setSheet(false);
    setFocus(null);
  };

  // Forslag under søkefeltet. onMouseDown hindrer at feltet mister fokus
  // (og lukker listen) før klikket rekker å registreres.
  const suggest = (pos: string) =>
    q.trim() ? (
      <div
        className={
          "absolute top-full z-50 mt-2 overflow-hidden rounded-2xl bg-canvas shadow-[0_0_0_1px_oklch(var(--line)),0_18px_40px_-16px_rgb(0_0_0/0.3)] " +
          pos
        }
        onMouseDown={(e) => e.preventDefault()}
      >
        {hits.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">
            {t(`Ingen treff på «${q.trim()}»`, `No results for “${q.trim()}”`)}
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {hits.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/butikk/${p.slug}`}
                  onClick={() => {
                    setFocus(null);
                    setSheet(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-surface"
                >
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface">
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted" aria-hidden>
                        {p.name.charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    {p.brand && <span className="block truncate text-[11px] tracking-wide text-muted uppercase">{p.brand}</span>}
                    <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-fg">{kr(p.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          className="block w-full border-t border-line px-4 py-2.5 text-left text-sm font-semibold text-fg hover:bg-surface"
        >
          {t(`Se alle treff for «${q.trim()}»`, `See all results for “${q.trim()}”`)} →
        </button>
      </div>
    ) : null;

  const popularIn = (d: Dept): ShopProduct[] =>
    products
      .filter((p) => deptOf(p.category)?.key === d.key && p.stock > 0)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 3);

  const current =
    menu && menu !== "merker"
      ? (depts.find((d) => d.key === menu) ?? null)
      : null;

  return (
    <div
      className="relative z-30 border-b border-line bg-canvas"
      onMouseLeave={closeSoon}
    >
      {/* ---------- PC ---------- */}
      <div className="mx-auto hidden max-w-7xl items-center justify-between gap-6 px-5 md:flex">
        <nav aria-label={t("Butikkategorier", "Shop categories")}>
          <ul className="flex items-center gap-1">
            <li>
              <Link
                href="/butikk"
                onMouseEnter={() => openSoon(null)}
                className={
                  "block px-3 py-4 text-[14px] font-semibold " +
                  (path === "/butikk" ? "text-fg" : "text-muted hover:text-fg")
                }
              >
                {t("Populært", "Popular")}
              </Link>
            </li>
            {depts.map((d) => {
              const active = activeDept === d.key;
              const open = menu === d.key;
              return (
                <li key={d.key} onMouseEnter={() => openSoon(d.key)}>
                  <Link
                    href={catUrl(d.key)}
                    aria-expanded={open}
                    aria-haspopup="true"
                    onFocus={() => setMenu(d.key)}
                    className={
                      "relative block px-3 py-4 text-[14px] font-semibold transition-colors " +
                      (active || open ? "text-fg" : "text-muted hover:text-fg")
                    }
                  >
                    {en ? d.en : d.no}
                    <span
                      aria-hidden
                      className={
                        "absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-fg transition-opacity " +
                        (active || open ? "opacity-100" : "opacity-0")
                      }
                    />
                  </Link>
                </li>
              );
            })}
            <li onMouseEnter={() => openSoon("merker")}>
              <button
                type="button"
                onClick={() =>
                  setMenu((m) => (m === "merker" ? null : "merker"))
                }
                aria-expanded={menu === "merker"}
                className={
                  "relative block px-3 py-4 text-[14px] font-semibold " +
                  (menu === "merker" ? "text-fg" : "text-muted hover:text-fg")
                }
              >
                {t("Merker", "Brands")}
              </button>
            </li>
          </ul>
        </nav>
        <div
          className="flex items-center gap-2"
          onMouseEnter={() => openSoon(null)}
        >
          <form role="search" onSubmit={search} className="relative">
            <label className="relative block">
              <span className="sr-only">
                {t("Søk i butikken", "Search the shop")}
              </span>
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setFocus("desk")}
                onBlur={() => setFocus((f) => (f === "desk" ? null : f))}
                onKeyDown={(e) => e.key === "Escape" && setFocus(null)}
                autoComplete="off"
                placeholder={t(
                  "Søk etter produkt eller merke",
                  "Search product or brand",
                )}
                className="h-10 w-64 rounded-full bg-surface pr-4 pl-10 text-sm text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] outline-none placeholder:text-muted focus:shadow-[0_0_0_2px_oklch(var(--fg))] lg:w-72"
              />
            </label>
            {focus === "desk" && suggest("right-0 w-[24rem]")}
          </form>
          <CartButton className="h-10 min-h-10" />
        </div>
      </div>

      {/* ---------- Nedtrekksmeny (PC) ---------- */}
      {menu && (
        <div
          className="absolute inset-x-0 top-full hidden border-t border-line bg-canvas shadow-[0_24px_40px_-24px_rgba(0,0,0,0.35)] md:block"
          onMouseEnter={() => openSoon(menu)}
          onMouseLeave={closeSoon}
        >
          {current ? (
            <div className="mx-auto grid max-w-7xl grid-cols-[1fr_1fr_1.6fr] gap-10 px-5 py-8">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                  {t("Produkttyper", "Product types")}
                </p>
                <ul className="mt-3 space-y-0.5">
                  {current.subs
                    .filter((x) => stats.sub.has(`${current.key}/${x.key}`))
                    .map((x) => (
                      <li key={x.key}>
                        <Link
                          href={catUrl(current.key, x.key)}
                          className="flex items-baseline justify-between gap-3 py-1.5 text-[15px] hover:underline"
                        >
                          {en ? x.en : x.no}
                          <span className="text-xs text-muted tabular-nums">
                            {stats.sub.get(`${current.key}/${x.key}`)}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
                <Link
                  href={catUrl(current.key)}
                  className="mt-4 inline-block text-sm font-semibold underline"
                >
                  {t(
                    `Se alt i ${current.no.toLowerCase()} (${stats.dept.get(current.key)})`,
                    `Shop all ${current.en.toLowerCase()} (${stats.dept.get(current.key)})`,
                  )}
                </Link>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                  {t("Handle etter behov", "Shop by need")}
                </p>
                <ul className="mt-3 space-y-0.5">
                  {NEEDS.map((n) => {
                    const c = products.filter(
                      (p) =>
                        deptOf(p.category)?.key === current.key && n.match(p),
                    ).length;
                    if (!c) return null;
                    return (
                      <li key={n.key}>
                        <Link
                          href={catUrl(
                            current.key,
                            null,
                            `behov=${encodeURIComponent(n.key)}`,
                          )}
                          className="flex items-baseline justify-between gap-3 py-1.5 text-[15px] hover:underline"
                        >
                          {en ? n.en : n.no}
                          <span className="text-xs text-muted tabular-nums">
                            {c}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                  {t(
                    `Mest populært i ${current.no.toLowerCase()}`,
                    `Most popular in ${current.en.toLowerCase()}`,
                  )}
                </p>
                <ul className="mt-3 grid grid-cols-3 gap-4">
                  {popularIn(current).map((p) => (
                    <li key={p.id}>
                      <Link href={`/butikk/${p.slug}`} className="group block">
                        <span className="block aspect-square overflow-hidden rounded-xl">
                          <ProductImage
                            p={p}
                            className="transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        </span>
                        {p.brand && (
                          <span className="mt-2 block text-[11px] text-muted uppercase">
                            {p.brand}
                          </span>
                        )}
                        <span className="line-clamp-2 text-[13px] font-medium group-hover:underline">
                          {p.name}
                        </span>
                        <span className="text-[13px] tabular-nums">
                          {kr(p.price)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-7xl px-5 py-8">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
                {t("Alle merker", "All brands")}
              </p>
              <ul className="mt-3 grid grid-cols-4 gap-x-8 lg:grid-cols-5">
                {stats.brands.map(([b, c]) => (
                  <li key={b}>
                    <Link
                      href={catUrl(
                        null,
                        null,
                        `merke=${encodeURIComponent(b)}`,
                      )}
                      className="flex items-baseline justify-between gap-2 py-1.5 text-[15px] hover:underline"
                    >
                      {b}
                      <span className="text-xs text-muted tabular-nums">
                        {c}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---------- Mobil ---------- */}
      <div className="md:hidden">
        <div className="relative flex items-center gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-sm font-semibold text-canvas"
            aria-haspopup="dialog"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
            </svg>
            {t("Kategorier", "Categories")}
          </button>
          <form role="search" onSubmit={search} className="min-w-0 flex-1">
            <label className="block">
              <span className="sr-only">
                {t("Søk i butikken", "Search the shop")}
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setFocus("mob")}
                onBlur={() => setFocus((f) => (f === "mob" ? null : f))}
                onKeyDown={(e) => e.key === "Escape" && setFocus(null)}
                autoComplete="off"
                placeholder={t("Søk …", "Search …")}
                className="h-10 w-full rounded-full bg-surface px-4 text-[15px] text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] outline-none placeholder:text-muted"
              />
            </label>
            {focus === "mob" && suggest("inset-x-4")}
          </form>
          <CartButton className="h-10 min-h-10 px-3" />
        </div>
        <nav
          aria-label={t("Butikkategorier", "Shop categories")}
          data-lenis-prevent
          className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]"
        >
          {[{ key: "", no: "Populært", en: "Popular" }, ...depts].map((d) => {
            const active = d.key ? activeDept === d.key : path === "/butikk";
            return (
              <Link
                key={d.key || "pop"}
                href={d.key ? catUrl(d.key) : "/butikk"}
                className={
                  "relative shrink-0 px-3 py-3 text-[14px] font-semibold whitespace-nowrap " +
                  (active ? "text-fg" : "text-muted")
                }
              >
                {en ? d.en : d.no}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-fg"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ---------- Kategorimeny (mobil, fullskjerm) ---------- */}
      {sheet &&
        createPortal(
          <div>
            <div
              style={{ position: "fixed" }}
              className="cine inset-0 z-[95] flex flex-col bg-canvas text-fg md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label={t("Kategorier", "Categories")}
            >
              <div className="flex items-center justify-between border-b border-line px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
                <p className="text-lg font-semibold">
                  {t("Kategorier", "Categories")}
                </p>
                <button
                  type="button"
                  onClick={() => setSheet(false)}
                  className="px-2 text-2xl leading-none text-muted"
                  aria-label={t("Lukk", "Close")}
                >
                  ×
                </button>
              </div>
              <div
                data-lenis-prevent
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              >
                <Link
                  href="/butikk"
                  className="flex min-h-14 items-center justify-between border-b border-line text-[17px] font-semibold"
                >
                  {t("Mest populære", "Most popular")}
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </Link>
                {depts.map((d) => {
                  const open = openDept === d.key;
                  return (
                    <div key={d.key} className="border-b border-line">
                      <button
                        type="button"
                        onClick={() => setOpenDept(open ? null : d.key)}
                        aria-expanded={open}
                        className="flex min-h-14 w-full items-center justify-between text-left text-[17px] font-semibold"
                      >
                        <span>
                          {en ? d.en : d.no}{" "}
                          <span className="ml-1 text-sm font-normal text-muted tabular-nums">
                            {stats.dept.get(d.key)}
                          </span>
                        </span>
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          className={
                            "h-5 w-5 text-muted transition-transform " +
                            (open ? "rotate-180" : "")
                          }
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            d="m6 9 6 6 6-6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {open && (
                        <ul className="pb-3">
                          <li>
                            <Link
                              href={catUrl(d.key)}
                              className="flex min-h-11 items-center text-[15px] font-semibold underline"
                            >
                              {t(
                                `Se alt i ${d.no.toLowerCase()}`,
                                `Shop all ${d.en.toLowerCase()}`,
                              )}
                            </Link>
                          </li>
                          {d.subs
                            .filter((x) => stats.sub.has(`${d.key}/${x.key}`))
                            .map((x) => (
                              <li key={x.key}>
                                <Link
                                  href={catUrl(d.key, x.key)}
                                  className="flex min-h-11 items-center justify-between text-[15px]"
                                >
                                  {en ? x.en : x.no}
                                  <span className="text-xs text-muted tabular-nums">
                                    {stats.sub.get(`${d.key}/${x.key}`)}
                                  </span>
                                </Link>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                <div className="border-b border-line">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDept(openDept === "merker" ? null : "merker")
                    }
                    aria-expanded={openDept === "merker"}
                    className="flex min-h-14 w-full items-center justify-between text-left text-[17px] font-semibold"
                  >
                    {t("Merker", "Brands")}
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className={
                        "h-5 w-5 text-muted transition-transform " +
                        (openDept === "merker" ? "rotate-180" : "")
                      }
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        d="m6 9 6 6 6-6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {openDept === "merker" && (
                    <ul className="grid grid-cols-2 gap-x-4 pb-3">
                      {stats.brands.map(([b]) => (
                        <li key={b}>
                          <Link
                            href={catUrl(
                              null,
                              null,
                              `merke=${encodeURIComponent(b)}`,
                            )}
                            className="flex min-h-11 items-center text-[15px]"
                          >
                            {b}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link
                  href={catUrl(null)}
                  className="flex min-h-14 items-center justify-between text-[17px] font-semibold"
                >
                  {t("Alle produkter", "All products")}
                  <span className="text-sm font-normal text-muted tabular-nums">
                    {products.length}
                  </span>
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
