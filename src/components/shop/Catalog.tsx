"use client";

import { matchesSearch } from "@/lib/search";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useShopData } from "@/components/shop/ShopShell";
import { ProductRow, ProductTile } from "@/components/shop/ProductTile";
import { useRecentlyViewed } from "@/components/shop/recent";
import {
  FINISH_ORDER,
  HOLD_ORDER,
  NEEDS,
  PRICE_BANDS,
  TAXONOMY,
  deptOf,
  finishGroup,
  holdGroup,
  catUrl,
  type Dept,
  type ShopProduct,
} from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * NETTBUTIKK – katalog.
 *   Forsiden: handle etter kategori, «finn produktet ditt» (behov),
 *   favoritter og merker. Listevisning: avdeling → produkttype, med
 *   filtre (type, behov, merke, hold, finish, pris, lager) og antall
 *   per valg – samme mønster som de store nettbutikkene.
 *   Alt ligger i adressefeltet, så lenker kan deles og «tilbake» virker.
 * ===================================================================== */

type Sort = "pop" | "price-asc" | "price-desc" | "name";
type State = {
  dept: string;
  sub: string;
  need: string;
  q: string;
  brands: string[];
  hold: string[];
  finish: string[];
  price: string[];
  inStock: boolean;
  sort: Sort;
  all: boolean;
};
type FacetKey = "sub" | "dept" | "need" | "brands" | "hold" | "finish" | "price" | "inStock";

const STYLE_NEEDS = ["matt", "blank", "sterkt"];


const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parseState(sp: URLSearchParams): State {
  const sort = sp.get("sorter") as Sort | null;
  return {
    dept: sp.get("kategori") ?? "",
    sub: sp.get("type") ?? "",
    need: sp.get("behov") ?? "",
    q: sp.get("q") ?? "",
    brands: list(sp.get("merke")),
    hold: list(sp.get("hold")),
    finish: list(sp.get("finish")),
    price: list(sp.get("pris")),
    inStock: sp.get("lager") === "1",
    sort: sort && ["pop", "price-asc", "price-desc", "name"].includes(sort) ? sort : "pop",
    all: sp.get("vis") === "alle",
  };
}

function toQuery(s: State): string {
  const sp = new URLSearchParams();
  if (s.need) sp.set("behov", s.need);
  if (s.q) sp.set("q", s.q);
  if (s.brands.length) sp.set("merke", s.brands.join(","));
  if (s.hold.length) sp.set("hold", s.hold.join(","));
  if (s.finish.length) sp.set("finish", s.finish.join(","));
  if (s.price.length) sp.set("pris", s.price.join(","));
  if (s.inStock) sp.set("lager", "1");
  if (s.sort !== "pop") sp.set("sorter", s.sort);
  return catUrl(s.dept || null, s.sub || null, sp.toString() || undefined);
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function haystack(p: ShopProduct): string {
  const d = deptOf(p.category);
  const sub = d?.subs.find((x) => x.key === p.subcategory);
  return norm([p.name, p.brand, d?.no, sub?.no, p.short, p.recommendedFor, p.tags.join(" ")].filter(Boolean).join(" "));
}

/** Gjelder alle filtre unntatt `except` (for antall per valg i filteret). */
function passes(p: ShopProduct, s: State, except?: FacetKey): boolean {
  if (except !== "dept" && s.dept && deptOf(p.category)?.key !== s.dept) return false;
  if (except !== "sub" && s.sub && p.subcategory !== s.sub) return false;
  if (except !== "need" && s.need) {
    const n = NEEDS.find((x) => x.key === s.need);
    if (n && !n.match(p)) return false;
  }
  if (except !== "brands" && s.brands.length && !s.brands.includes(p.brand ?? "")) return false;
  if (except !== "hold" && s.hold.length && !s.hold.includes(holdGroup(p.hold)?.key ?? "")) return false;
  if (except !== "finish" && s.finish.length && !s.finish.includes(finishGroup(p.shine)?.key ?? "")) return false;
  if (except !== "price" && s.price.length) {
    const ok = PRICE_BANDS.some((b) => s.price.includes(b.key) && p.price >= b.min && p.price <= b.max);
    if (!ok) return false;
  }
  if (except !== "inStock" && s.inStock && p.stock <= 0) return false;
  if (s.q && !matchesSearch(s.q, { text: [haystack(p)] })) return false;
  return true;
}

function countBy(products: ShopProduct[], s: State, except: FacetKey, key: (p: ShopProduct) => string | string[] | null) {
  const m = new Map<string, number>();
  for (const p of products) {
    if (!passes(p, s, except)) continue;
    const k = key(p);
    for (const x of Array.isArray(k) ? k : k ? [k] : []) m.set(x, (m.get(x) ?? 0) + 1);
  }
  return m;
}

/* ---------- Små byggeklosser ---------- */

function Check({ label, count, checked, onChange, radio = false }: { label: string; count?: number; checked: boolean; onChange: () => void; radio?: boolean }) {
  const off = !checked && count === 0;
  return (
    <label className={"flex min-h-9 cursor-pointer items-center gap-2.5 text-[14px] " + (off ? "opacity-40" : "")}>
      <input type={radio ? "radio" : "checkbox"} checked={checked} onChange={onChange} disabled={off} className="h-4 w-4 shrink-0 accent-[var(--color-fg)]" />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs text-muted tabular-nums">{count}</span>}
    </label>
  );
}

function FacetGroup({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-2 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-[13px] font-semibold tracking-wide uppercase">
        {title}
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

/* ---------- Hovedkomponent ---------- */

export function Catalog({
  deptKey,
  subKey,
  initial,
}: {
  deptKey: string | null;
  subKey: string | null;
  initial: Record<string, string | undefined>;
}) {
  const { products, bySlug } = useShopData();
  const router = useRouter();
  const { lang } = useLanguage();
  const en = lang === "en";
  const [s, setS] = useState<State>(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(initial)) if (v) sp.set(k, v);
    return { ...parseState(sp), dept: deptKey ?? "", sub: subKey ?? "" };
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const recent = useRecentlyViewed();

  // Ny kategori = ny side (egen adresse). Filtre og produkttype = samme side,
  // adressen oppdateres så lenken kan deles.
  const go = useCallback(
    (next: State, push = false) => {
      if (push && next.dept !== s.dept) {
        router.push(toQuery(next));
        return;
      }
      setS(next);
      window.history.replaceState(null, "", toQuery(next));
    },
    [router, s.dept],
  );
  const update = (patch: Partial<State>, push = false) => go({ ...s, ...patch }, push);

  useEffect(() => {
    if (!filtersOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [filtersOpen]);

  const dept: Dept | null = s.dept ? TAXONOMY.find((d) => d.key === s.dept) ?? null : null;
  const sub = dept?.subs.find((x) => x.key === s.sub) ?? null;
  const need = NEEDS.find((n) => n.key === s.need) ?? null;
  const t = (no: string, enText: string) => (en ? enText : no);

  const results = useMemo(() => {
    const l = products.filter((p) => passes(p, s));
    if (s.sort === "price-asc") l.sort((a, b) => a.price - b.price);
    else if (s.sort === "price-desc") l.sort((a, b) => b.price - a.price);
    else if (s.sort === "name") l.sort((a, b) => a.name.localeCompare(b.name, "nb"));
    else l.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || b.popularity - a.popularity);
    return l;
  }, [products, s]);

  const deptCounts = useMemo(() => countBy(products, s, "dept", (p) => deptOf(p.category)?.key ?? null), [products, s]);
  const subCounts = useMemo(() => countBy(products, s, "sub", (p) => p.subcategory), [products, s]);
  const needCounts = useMemo(() => countBy(products, s, "need", (p) => NEEDS.filter((n) => n.match(p)).map((n) => n.key)), [products, s]);
  const brandCounts = useMemo(() => countBy(products, s, "brands", (p) => p.brand), [products, s]);
  const holdCounts = useMemo(() => countBy(products, s, "hold", (p) => holdGroup(p.hold)?.key ?? null), [products, s]);
  const finishCounts = useMemo(() => countBy(products, s, "finish", (p) => finishGroup(p.shine)?.key ?? null), [products, s]);
  const priceCounts = useMemo(
    () => countBy(products, s, "price", (p) => PRICE_BANDS.filter((b) => p.price >= b.min && p.price <= b.max).map((b) => b.key)),
    [products, s],
  );
  const stockCount = useMemo(() => products.filter((p) => passes(p, s, "inStock") && p.stock > 0).length, [products, s]);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const d = deptOf(p.category)?.key;
      if (d) m.set(d, (m.get(d) ?? 0) + 1);
      if (p.subcategory) m.set(`${d}/${p.subcategory}`, (m.get(`${d}/${p.subcategory}`) ?? 0) + 1);
    }
    return m;
  }, [products]);

  const toggle = (k: "brands" | "hold" | "finish" | "price", v: string) =>
    update({ [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] } as Partial<State>);

  const facetCount = s.brands.length + s.hold.length + s.finish.length + s.price.length + (s.inStock ? 1 : 0) + (s.need ? 1 : 0) + (s.sub ? 1 : 0);
  const hasStyling = results.some((p) => p.hold != null || p.shine != null) || s.hold.length > 0 || s.finish.length > 0;
  const recentList = useMemo(() => recent.map((x) => bySlug.get(x)).filter(Boolean).slice(0, 8) as ShopProduct[], [recent, bySlug]);

  /* ---------- Filterpanel (samme innhold på PC og mobil) ---------- */
  const facets = (
    <div>
      {!dept ? (
        <FacetGroup title={t("Kategori", "Category")}>
          {TAXONOMY.filter((d) => totals.has(d.key)).map((d) => (
            <Check key={d.key} label={en ? d.en : d.no} count={deptCounts.get(d.key) ?? 0} checked={false} onChange={() => update({ dept: d.key, sub: "" }, true)} />
          ))}
        </FacetGroup>
      ) : (
        <FacetGroup title={t("Produkttype", "Product type")}>
          <Check radio label={t(`Alle i ${dept.no.toLowerCase()}`, `All ${dept.en.toLowerCase()}`)} checked={!s.sub} onChange={() => update({ sub: "" })} />
          {dept.subs
            .filter((x) => totals.has(`${dept.key}/${x.key}`))
            .map((x) => (
              <Check key={x.key} radio label={en ? x.en : x.no} count={subCounts.get(x.key) ?? 0} checked={s.sub === x.key} onChange={() => update({ sub: x.key })} />
            ))}
        </FacetGroup>
      )}

      <FacetGroup title={t("Behov", "Need")} open={!!s.need || !dept}>
        {/* Matt / blank / sterkt hold har egne filtre (Hold og Finish) – vis dem ikke dobbelt. */}
        {NEEDS.filter((n) => s.need === n.key || ((needCounts.get(n.key) ?? 0) > 0 && !(hasStyling && STYLE_NEEDS.includes(n.key)))).map((n) => (
          <Check key={n.key} label={en ? n.en : n.no} count={needCounts.get(n.key) ?? 0} checked={s.need === n.key} onChange={() => update({ need: s.need === n.key ? "" : n.key })} />
        ))}
      </FacetGroup>

      {hasStyling && (
        <>
          <FacetGroup title={t("Hold", "Hold")}>
            {HOLD_ORDER.map((k) => {
              const g = holdGroup(k === "lett" ? 1 : k === "medium" ? 3 : k === "sterkt" ? 4 : 5)!;
              return <Check key={k} label={en ? g.en : g.no} count={holdCounts.get(k) ?? 0} checked={s.hold.includes(k)} onChange={() => toggle("hold", k)} />;
            })}
          </FacetGroup>
          <FacetGroup title={t("Finish", "Finish")}>
            {FINISH_ORDER.map((k) => {
              const g = finishGroup(k === "matt" ? 0 : k === "naturlig" ? 2 : 5)!;
              return <Check key={k} label={en ? g.en : g.no} count={finishCounts.get(k) ?? 0} checked={s.finish.includes(k)} onChange={() => toggle("finish", k)} />;
            })}
          </FacetGroup>
        </>
      )}

      <FacetGroup title={t("Merke", "Brand")}>
        {(() => {
          const rows = [...brandCounts.entries()]
            .concat(s.brands.filter((b) => !brandCounts.has(b)).map((b) => [b, 0] as [string, number]))
            .sort((a, b) => a[0].localeCompare(b[0], "nb"));
          const shown = showAllBrands || rows.length <= 8 ? rows : rows.slice(0, 8);
          return (
            <>
              {shown.map(([b, c]) => (
                <Check key={b} label={b} count={c} checked={s.brands.includes(b)} onChange={() => toggle("brands", b)} />
              ))}
              {rows.length > 8 && (
                <button type="button" onClick={() => setShowAllBrands((v) => !v)} className="mt-1 text-[13px] underline">
                  {showAllBrands ? t("Vis færre", "Show fewer") : t(`Vis alle ${rows.length}`, `Show all ${rows.length}`)}
                </button>
              )}
            </>
          );
        })()}
      </FacetGroup>

      <FacetGroup title={t("Pris", "Price")}>
        {PRICE_BANDS.map((b) => (
          <Check key={b.key} label={en ? b.en : b.no} count={priceCounts.get(b.key) ?? 0} checked={s.price.includes(b.key)} onChange={() => toggle("price", b.key)} />
        ))}
      </FacetGroup>

      <FacetGroup title={t("Tilgjengelighet", "Availability")}>
        <Check label={t("Bare på lager", "In stock only")} count={stockCount} checked={s.inStock} onChange={() => update({ inStock: !s.inStock })} />
      </FacetGroup>
    </div>
  );

  /* ---------- Aktive filtre som «piller» ---------- */
  const pills: { label: string; clear: () => void }[] = [];
  if (sub) pills.push({ label: en ? sub.en : sub.no, clear: () => update({ sub: "" }) });
  if (need) pills.push({ label: en ? need.en : need.no, clear: () => update({ need: "" }) });
  s.brands.forEach((b) => pills.push({ label: b, clear: () => toggle("brands", b) }));
  s.hold.forEach((k) => {
    const g = holdGroup(k === "lett" ? 1 : k === "medium" ? 3 : k === "sterkt" ? 4 : 5)!;
    pills.push({ label: en ? g.en : g.no, clear: () => toggle("hold", k) });
  });
  s.finish.forEach((k) => {
    const g = finishGroup(k === "matt" ? 0 : k === "naturlig" ? 2 : 5)!;
    pills.push({ label: en ? g.en : g.no, clear: () => toggle("finish", k) });
  });
  s.price.forEach((k) => {
    const b = PRICE_BANDS.find((x) => x.key === k);
    if (b) pills.push({ label: en ? b.en : b.no, clear: () => toggle("price", k) });
  });
  if (s.inStock) pills.push({ label: t("På lager", "In stock"), clear: () => update({ inStock: false }) });
  const clearFilters = () => update({ sub: "", need: dept ? "" : s.need, brands: [], hold: [], finish: [], price: [], inStock: false });


  const title = s.q
    ? t(`Søk: «${s.q}»`, `Search: “${s.q}”`)
    : sub
      ? en
        ? sub.en
        : sub.no
      : dept
        ? en
          ? dept.en
          : dept.no
        : need
          ? en
            ? need.en
            : need.no
          : t("Alle produkter", "All products");
  const intro = dept && !sub ? (en ? dept.introEn : dept.introNo) : need && !dept ? (en ? need.hintEn : need.hintNo) : null;

  return (
    <main className="mx-auto max-w-7xl px-5 pt-6 pb-24 sm:pt-10">
          {/* ---------- Listevisning ---------- */}
          <nav aria-label={t("Brødsmuler", "Breadcrumb")} className="mt-6 text-[13px] text-muted">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/butikk" className="hover:text-fg hover:underline">
                  {t("Butikk", "Shop")}
                </Link>
              </li>
              {dept && (
                <>
                  <li aria-hidden>/</li>
                  <li>
                    {sub ? (
                      <Link href={catUrl(dept.key)} className="hover:text-fg hover:underline">
                        {en ? dept.en : dept.no}
                      </Link>
                    ) : (
                      <span className="text-fg">{en ? dept.en : dept.no}</span>
                    )}
                  </li>
                </>
              )}
              {sub && (
                <>
                  <li aria-hidden>/</li>
                  <li className="text-fg">{en ? sub.en : sub.no}</li>
                </>
              )}
            </ol>
          </nav>

          <header className="mt-3">
            <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
            {intro && <p className="mt-2 max-w-2xl text-fg-soft">{intro}</p>}
          </header>

          {dept && dept.subs.length > 1 && (
            <div data-lenis-prevent className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 py-1.5 [scrollbar-width:none]">
              {[{ key: "", no: `Alle`, en: `All` }, ...dept.subs.filter((x) => totals.has(`${dept.key}/${x.key}`))].map((x) => {
                const on = s.sub === x.key;
                const c = x.key ? totals.get(`${dept.key}/${x.key}`) : totals.get(dept.key);
                return (
                  <button
                    key={x.key || "alle"}
                    type="button"
                    onClick={() => update({ sub: x.key })}
                    aria-pressed={on}
                    className={
                      "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors " +
                      (on ? "bg-fg text-canvas" : "text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]")
                    }
                  >
                    {en ? x.en : x.no}
                    <span className={"ml-1.5 text-xs tabular-nums " + (on ? "opacity-70" : "text-muted")}>{c}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
            <aside className="hidden lg:block" aria-label={t("Filtre", "Filters")}>
              {facets}
            </aside>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-[0_0_0_1px_oklch(var(--line-2))] lg:hidden"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                      <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
                    </svg>
                    {t("Filter", "Filter")}
                    {facetCount > 0 && <span className="rounded-full bg-fg px-1.5 text-[11px] text-canvas tabular-nums">{facetCount}</span>}
                  </button>
                  <span className="text-sm text-muted" aria-live="polite">
                    {results.length} {results.length === 1 ? t("produkt", "product") : t("produkter", "products")}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="hidden text-muted sm:inline">{t("Sorter", "Sort")}</span>
                  <select
                    value={s.sort}
                    onChange={(e) => update({ sort: e.target.value as Sort })}
                    className="h-10 rounded-full bg-surface px-4 text-sm text-fg shadow-[0_0_0_1px_oklch(var(--line-2))]"
                  >
                    <option value="pop">{t("Mest populære", "Most popular")}</option>
                    <option value="price-asc">{t("Pris: lav til høy", "Price: low to high")}</option>
                    <option value="price-desc">{t("Pris: høy til lav", "Price: high to low")}</option>
                    <option value="name">{t("Navn A–Å", "Name A–Z")}</option>
                  </select>
                </label>
              </div>

              {pills.length > 0 && (
                <ul className="mt-4 flex flex-wrap items-center gap-2">
                  {pills.map((p) => (
                    <li key={p.label}>
                      <button type="button" onClick={p.clear} className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2">
                        {p.label} <span aria-hidden className="text-muted">×</span>
                        <span className="sr-only">{t("fjern", "remove")}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" onClick={clearFilters} className="text-[13px] underline">
                      {t("Nullstill alle", "Clear all")}
                    </button>
                  </li>
                </ul>
              )}

              {results.length === 0 ? (
                <div className="mt-8 rounded-2xl bg-surface p-10 text-center">
                  <p className="font-medium">{t("Ingen produkter passer.", "No products match.")}</p>
                  <p className="mt-1 text-sm text-muted">{t("Prøv å fjerne et filter – eller spør oss i salongen.", "Try removing a filter – or ask us in the salon.")}</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    {pills.length > 0 && (
                      <button type="button" onClick={clearFilters} className="pill pill-dark">
                        {t("Nullstill filtre", "Clear filters")}
                      </button>
                    )}
                    <Link href="/butikk" className="pill pill-soft">
                      {t("Til butikken", "Back to shop")}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3">
                  {results.map((p, i) => (
                    <ProductTile key={p.id} p={p} eager={i < 4} />
                  ))}
                </div>
              )}
            </div>
          </div>

      {recentList.length > 0 && <ProductRow id="recent" title={t("Nylig sett", "Recently viewed")} products={recentList} />}

      <section className="mt-16 grid gap-6 rounded-3xl bg-surface p-7 sm:grid-cols-[1fr_auto] sm:items-center sm:p-10">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t("Usikker på hva som passer håret ditt?", "Not sure what suits your hair?")}</h2>
          <p className="mt-2 max-w-xl text-muted">
            {t(
              "Spør barberen din neste gang du er innom – vi viser deg også hvordan du bruker produktet.",
              "Ask your barber at your next visit – we'll show you how to use it, too.",
            )}
          </p>
        </div>
        <Link href="/booking" className="pill pill-primary">
          {t("Bestill time", "Book appointment")}
        </Link>
      </section>

      {/* ---------- Filter-skuff (mobil) ---------- */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label={t("Filtre", "Filters")}>
          <button type="button" aria-label={t("Lukk", "Close")} className="absolute inset-0 bg-black/45" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl bg-canvas shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-semibold">{t("Filtre", "Filters")}</h2>
              <button type="button" onClick={() => setFiltersOpen(false)} className="px-2 text-2xl leading-none text-muted" aria-label={t("Lukk", "Close")}>
                ×
              </button>
            </div>
            <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
              {facets}
            </div>
            <div className="flex gap-3 border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={clearFilters} className="pill pill-soft">
                {t("Nullstill", "Clear")}
              </button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="pill pill-dark flex-1">
                {results.length === 1 ? t("Vis 1 produkt", "Show 1 product") : t(`Vis ${results.length} produkter`, `Show ${results.length} products`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
