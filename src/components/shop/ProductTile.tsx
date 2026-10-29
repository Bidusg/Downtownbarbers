"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/shop/CartProvider";
import { finishGroup, holdGroup, kr, stockLabel, type ShopProduct } from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** Bilde eller en pen plassholder (merke + forbokstaver) når bilde mangler. */
export function ProductImage({ p, className = "", eager = false }: { p: ShopProduct; className?: string; eager?: boolean }) {
  const [a, b] = p.images;
  if (!a) {
    const ini = p.name
      .split(/\s+/)
      .filter((w) => /^[A-Za-zÆØÅæøå]/.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <div className={"flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-2 " + className}>
        <span className="font-display text-4xl font-bold tracking-wide text-line-2 select-none">{ini}</span>
        {p.brand && <span className="px-3 text-center text-[10px] font-semibold tracking-[0.22em] text-muted uppercase">{p.brand}</span>}
      </div>
    );
  }
  return (
    <div className={"relative h-full w-full bg-surface-2 " + className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={a}
        alt={p.name}
        loading={eager ? "eager" : "lazy"}
        className={"absolute inset-0 h-full w-full object-cover transition-opacity duration-500 " + (b ? "group-hover:opacity-0" : "")}
      />
      {b && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      )}
    </div>
  );
}

export function PriceTag({ p, large = false }: { p: ShopProduct; large?: boolean }) {
  const sale = p.compareAt != null && p.compareAt > p.price;
  return (
    <span className="inline-flex items-baseline gap-2 tabular-nums">
      <span className={(large ? "text-2xl " : "text-[15px] ") + "font-semibold " + (sale ? "text-accent-soft" : "text-fg")}>{kr(p.price)}</span>
      {sale && <s className={(large ? "text-base " : "text-xs ") + "text-muted"}>{kr(p.compareAt!)}</s>}
    </span>
  );
}

export function ProductTile({ p, eager = false, badge }: { p: ShopProduct; eager?: boolean; badge?: string }) {
  const { add } = useCart();
  const { lang, t } = useLanguage();
  const st = stockLabel(p.stock);
  const sale = p.compareAt != null && p.compareAt > p.price;
  const out = st.tone === "out";

  return (
    <article className="group relative flex flex-col">
      <Link href={`/butikk/${p.slug}`} className="block overflow-hidden rounded-2xl">
        <div className="relative aspect-square">
          <ProductImage p={p} eager={eager} className="transition-transform duration-500 group-hover:scale-[1.02]" />
          <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
            {sale && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-[#1d1a17]">{lang === "en" ? "Sale" : "Tilbud"}</span>}
            {badge && !sale && <span className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-semibold text-canvas">{badge}</span>}
            {p.featured && !sale && !badge && (
              <span className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-semibold text-canvas">{lang === "en" ? "Barbers' pick" : "Barbernes favoritt"}</span>
            )}
          </div>
          {out && (
            <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1.5 text-center text-xs font-semibold text-white">{t("shop.soldOut")}</span>
          )}
        </div>
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        {p.brand && <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{p.brand}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-medium text-fg">
          <Link href={`/butikk/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
            {p.name}
          </Link>
        </h3>
        {(p.hold != null || p.shine != null) && (
          <p className="mt-1 text-[12px] font-medium text-fg-soft">
            {[holdGroup(p.hold), finishGroup(p.shine)]
              .filter(Boolean)
              .map((g) => (lang === "en" ? g!.en : g!.no))
              .join(" · ")}
          </p>
        )}
        {p.short && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{p.short}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="flex flex-col">
            <PriceTag p={p} />
            {st.tone === "low" && <span className="text-[11px] font-medium text-accent-soft">{lang === "en" ? st.en : st.no}</span>}
          </div>
          <button
            type="button"
            disabled={out}
            onClick={() => add(p)}
            className="relative z-10 inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-full bg-fg px-3 text-sm font-semibold text-canvas transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`${t("shop.addToCart")}: ${p.name}`}
          >
            <span aria-hidden className="text-base leading-none">+</span>
            <span className="hidden text-[13px] sm:inline">{t("shop.add")}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

/** Vannrett rad med produkter (forslag nederst på sider). */
export function ProductRow({ title, products, id, action }: { title: string; products: ShopProduct[]; id: string; action?: React.ReactNode }) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdge((p) => (p.l === l && p.r === r ? p : { l, r }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update, products.length]);

  // Bla én «side» (det som er synlig), og land på starten av et kort.
  const go = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : 240;
    const perPage = Math.max(1, Math.floor((el.clientWidth + 16) / step));
    el.scrollBy({ left: dir * perPage * step, behavior: "smooth" });
  };

  if (!products.length) return null;

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-fg shadow-[0_0_0_1px_oklch(var(--line))] transition-[opacity,box-shadow] hover:shadow-[0_0_0_1px_oklch(var(--line-2)),0_2px_6px_rgb(0_0_0/0.08)] disabled:pointer-events-none disabled:opacity-35";
  const arrows = edge.l || edge.r;

  return (
    <section aria-labelledby={id} className="mt-14">
      <div className="flex items-end justify-between gap-4">
        <h2 id={id} className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>
        <div className="flex items-center gap-3">
          {action}
          {arrows && (
            <div className="flex gap-2">
              <button type="button" onClick={() => go(-1)} disabled={!edge.l} aria-label={en ? "Previous products" : "Forrige varer"} className={btn}>
                <Chevron dir="left" />
              </button>
              <button type="button" onClick={() => go(1)} disabled={!edge.r} aria-label={en ? "Next products" : "Neste varer"} className={btn}>
                <Chevron dir="right" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="relative">
        <div
          ref={ref}
          data-lenis-prevent
          className="-mx-5 mt-5 flex snap-x scroll-pl-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((p) => (
            <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%]">
              <ProductTile p={p} />
            </div>
          ))}
        </div>
        {/* Stor pil på siden av raden (PC), i tillegg til pilene ved tittelen */}
        {edge.r && (
          <button
            type="button"
            onClick={() => go(1)}
            tabIndex={-1}
            aria-hidden
            className={btn + " absolute top-[calc(50%-2rem)] -right-3 z-10 hidden h-12 w-12 shadow-[0_0_0_1px_oklch(var(--line)),0_6px_18px_-6px_rgb(0_0_0/0.25)] sm:flex"}
          >
            <Chevron dir="right" />
          </button>
        )}
        {edge.l && (
          <button
            type="button"
            onClick={() => go(-1)}
            tabIndex={-1}
            aria-hidden
            className={btn + " absolute top-[calc(50%-2rem)] -left-3 z-10 hidden h-12 w-12 shadow-[0_0_0_1px_oklch(var(--line)),0_6px_18px_-6px_rgb(0_0_0/0.25)] sm:flex"}
          >
            <Chevron dir="left" />
          </button>
        )}
      </div>
    </section>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
    </svg>
  );
}
