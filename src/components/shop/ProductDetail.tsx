"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/shop/CartProvider";
import { QtyStepper, useShopData } from "@/components/shop/ShopShell";
import { PriceTag, ProductImage, ProductRow } from "@/components/shop/ProductTile";
import { rememberViewed, useRecentlyViewed } from "@/components/shop/recent";
import { CATEGORY_EN, kr, stockLabel, type ShopProduct } from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * PRODUKTSIDE – bildegalleri, kjøpsboks, «kjøpes ofte sammen»,
 * beskrivelser i trekkspill, og forslag nederst.
 * ===================================================================== */

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-14 text-muted">{label}</span>
      <span className="flex gap-1" role="img" aria-label={`${label}: ${value} av 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={"h-1.5 w-6 rounded-full " + (i <= value ? "bg-fg" : "bg-line")} />
        ))}
      </span>
    </div>
  );
}

function Accordion({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-1 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-2 text-[15px] font-semibold">
        {title}
        <span aria-hidden className="text-xl leading-none text-muted transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pb-5 text-[15px] leading-relaxed text-fg-soft">{children}</div>
    </details>
  );
}

function Gallery({ p }: { p: ShopProduct }) {
  const [i, setI] = useState(0);
  const imgs = p.images;
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-3xl">
        {imgs.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgs[i]} alt={p.name} className="h-full w-full bg-surface-2 object-cover" />
        ) : (
          <ProductImage p={p} eager />
        )}
      </div>
      {imgs.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Bilder">
          {imgs.map((src, k) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={k === i}
              onClick={() => setI(k)}
              className={"h-18 w-18 shrink-0 overflow-hidden rounded-xl " + (k === i ? "ring-2 ring-fg" : "opacity-70 hover:opacity-100")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** «Kjøpes ofte sammen» – produktet + to tillegg, legg alle i kurven med ett trykk. */
function BoughtTogether({ p, others }: { p: ShopProduct; others: ShopProduct[] }) {
  const { add } = useCart();
  const { lang } = useLanguage();
  const en = lang === "en";
  const [off, setOff] = useState<Set<string>>(new Set());
  if (!others.length || p.stock <= 0) return null;
  const all = [p, ...others];
  const chosen = all.filter((x) => x.id === p.id || !off.has(x.id));
  const total = chosen.reduce((s, x) => s + x.price, 0);
  return (
    <section aria-labelledby="fbt" className="mt-14 rounded-3xl bg-surface p-6 sm:p-8">
      <h2 id="fbt" className="text-xl font-semibold tracking-tight">
        {en ? "Frequently bought together" : "Kjøpes ofte sammen"}
      </h2>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <ul className="grid gap-3 sm:grid-cols-3">
          {all.map((x) => {
            const self = x.id === p.id;
            const on = self || !off.has(x.id);
            return (
              <li key={x.id}>
                <label className={"flex h-full cursor-pointer gap-3 rounded-2xl bg-canvas p-3 " + (on ? "" : "opacity-55")}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={self}
                    onChange={() =>
                      setOff((s) => {
                        const n = new Set(s);
                        if (n.has(x.id)) n.delete(x.id);
                        else n.add(x.id);
                        return n;
                      })
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent-soft)]"
                  />
                  <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                    <ProductImage p={x} />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium">
                      {self ? (en ? "This item: " : "Denne: ") : ""}
                      {x.name}
                    </span>
                    <span className="mt-1 block text-sm font-semibold tabular-nums">{kr(x.price)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <p className="text-sm text-muted">
            {en ? "Total" : "Totalt"}: <span className="text-lg font-semibold text-fg tabular-nums">{kr(total)}</span>
          </p>
          <button type="button" className="pill pill-dark" onClick={() => chosen.forEach((x) => add(x))}>
            {chosen.length > 1
              ? en
                ? `Add all ${chosen.length} to bag`
                : `Legg alle ${chosen.length} i handlekurven`
              : en
                ? "Add to bag"
                : "Legg i handlekurven"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function ProductDetail({ product, member }: { product: ShopProduct; member: { tier: string; pct: number } | null }) {
  const { bySlug, products, settings } = useShopData();
  const p = bySlug.get(product.slug) ?? product;
  const { add } = useCart();
  const router = useRouter();
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const [qty, setQty] = useState(1);
  const buyRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  const st = stockLabel(p.stock);
  const out = st.tone === "out";
  const max = Math.max(1, Math.min(20, p.stock || 1));
  const recent = useRecentlyViewed(p.slug);

  useEffect(() => rememberViewed(p.slug), [p.slug]);

  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const related = useMemo(() => p.related.map((s) => bySlug.get(s)).filter((x): x is ShopProduct => !!x && x.id !== p.id), [p, bySlug]);
  const together = useMemo(() => related.filter((x) => x.stock > 0).slice(0, 2), [related]);
  const similar = useMemo(() => {
    const ids = new Set([p.id, ...together.map((x) => x.id)]);
    const same = products.filter((x) => !ids.has(x.id) && x.category === p.category);
    // Samme merke først, så nærmest i pris.
    same.sort((a, b) => Number(b.brand === p.brand) - Number(a.brand === p.brand) || Math.abs(a.price - p.price) - Math.abs(b.price - p.price));
    return [...related.filter((x) => !ids.has(x.id)), ...same].filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i).slice(0, 10);
  }, [p, products, related, together]);
  const recentList = useMemo(() => recent.map((s) => bySlug.get(s)).filter(Boolean).slice(0, 8) as ShopProduct[], [recent, bySlug]);

  const memberPrice = member ? Math.round(p.price - (p.price * member.pct) / 100) : null;
  const catLabel = p.category ? (en ? CATEGORY_EN[p.category] ?? p.category : p.category) : null;

  const addToCart = () => add(p, qty);
  const buyNow = () => {
    add(p, qty);
    router.push("/butikk/handlekurv");
  };

  const trust = [
    settings.pickup ? (en ? "Pick up in the salon – usually ready the same day" : "Hent i salongen – som regel klar samme dag") : null,
    settings.ship ? (en ? `Shipping ${kr(settings.shippingNok)} · free over ${kr(settings.freeOverNok)}` : `Frakt ${kr(settings.shippingNok)} · gratis over ${kr(settings.freeOverNok)}`) : null,
    en ? "14-day right of withdrawal" : "14 dagers angrerett",
    en ? "Secure payment with Vipps" : "Trygg betaling med Vipps",
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-7xl px-5 pt-6 pb-28 sm:pt-10">
      <nav aria-label="Brødsmuler" className="text-[13px] text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/butikk" className="hover:text-fg hover:underline">
              {en ? "Shop" : "Butikk"}
            </Link>
          </li>
          {p.category && (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`/butikk?kategori=${encodeURIComponent(p.category)}`} className="hover:text-fg hover:underline">
                  {catLabel}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden>/</li>
          <li aria-current="page" className="line-clamp-1 text-fg">
            {p.name}
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <Gallery p={p} />

        <div>
          {p.brand && (
            <Link href={`/butikk?merke=${encodeURIComponent(p.brand)}`} className="text-[13px] font-semibold tracking-wide text-muted uppercase hover:text-fg">
              {p.brand}
            </Link>
          )}
          <h1 className="mt-1 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{p.name}</h1>
          {p.short && <p className="mt-3 text-[17px] leading-relaxed text-fg-soft">{p.short}</p>}

          <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <PriceTag p={p} large />
            {p.size && <span className="text-sm text-muted">{p.size}</span>}
          </div>
          {member && memberPrice != null && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent-soft/15 px-3 py-1 text-[13px] font-medium">
              {en ? "Club price" : "Kundeklubb-pris"} {member.tier ? `(${member.tier})` : ""}: {kr(memberPrice)}
              <span className="text-muted">−{member.pct} %</span>
            </p>
          )}

          {(p.hold != null || p.shine != null) && (
            <div className="mt-5 space-y-2">
              {p.hold != null && <Meter label={en ? "Hold" : "Hold"} value={p.hold} />}
              {p.shine != null && <Meter label={en ? "Shine" : "Glans"} value={p.shine} />}
            </div>
          )}

          <p className={"mt-5 flex items-center gap-2 text-sm font-medium " + (out ? "text-muted" : st.tone === "low" ? "text-accent-soft" : "text-fg")}>
            <span aria-hidden className={"h-2 w-2 rounded-full " + (out ? "bg-line-2" : st.tone === "low" ? "bg-accent-soft" : "bg-[oklch(68%_0.15_150)]")} />
            {en ? st.en : st.no}
          </p>

          <div ref={buyRef} className="mt-4 flex flex-wrap items-center gap-3">
            {!out && <QtyStepper qty={qty} max={max} onChange={(n) => setQty(Math.max(1, Math.min(max, n)))} label={en ? "Quantity" : "Antall"} />}
            <button type="button" onClick={addToCart} disabled={out} className="pill pill-primary flex-1 disabled:cursor-not-allowed disabled:opacity-40">
              {out ? t("shop.soldOut") : t("shop.addToCart")}
            </button>
          </div>
          {!out && (
            <button type="button" onClick={buyNow} className="pill pill-dark mt-3 w-full">
              {en ? "Buy now" : "Kjøp nå"}
            </button>
          )}
          {out && (
            <p className="mt-3 text-sm text-muted">
              {en ? "Ask for it in the salon – we restock often." : "Spør etter den i salongen – vi fyller på lageret jevnlig."}
            </p>
          )}

          <ul className="mt-6 grid gap-2 rounded-2xl bg-surface p-4 text-[13px] text-fg-soft sm:grid-cols-2">
            {trust.map((x) => (
              <li key={x} className="flex gap-2">
                <span aria-hidden className="text-accent-soft">
                  ✓
                </span>
                {x}
              </li>
            ))}
          </ul>

          <div className="mt-8 border-t border-line">
            {p.description && (
              <Accordion title={en ? "Description" : "Beskrivelse"} open>
                {p.description.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className={i ? "mt-3" : ""}>
                    {para}
                  </p>
                ))}
              </Accordion>
            )}
            {p.benefits.length > 0 && (
              <Accordion title={en ? "What it does" : "Hva den gjør"} open={!p.description}>
                <ul className="space-y-1.5">
                  {p.benefits.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span aria-hidden className="text-accent-soft">
                        •
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </Accordion>
            )}
            {p.recommendedFor && <Accordion title={en ? "Recommended for" : "Anbefalt for"}>{p.recommendedFor}</Accordion>}
            {p.howToUse && <Accordion title={en ? "How to use" : "Slik bruker du den"}>{p.howToUse}</Accordion>}
            {p.ingredients && (
              <Accordion title={en ? "Ingredients" : "Ingredienser"}>
                <p className="text-sm">{p.ingredients}</p>
              </Accordion>
            )}
          </div>
        </div>
      </div>

      <BoughtTogether p={p} others={together} />
      <ProductRow id="similar" title={en ? "Customers also viewed" : "Andre så også på"} products={similar} />
      {recentList.length > 0 && <ProductRow id="recent" title={en ? "Recently viewed" : "Nylig sett"} products={recentList} />}

      {/* Klistrete kjøpslinje (mobil) når kjøpsknappen er scrollet forbi */}
      {showBar && !out && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
              <p className="text-sm font-semibold tabular-nums">{kr(p.price)}</p>
            </div>
            <button type="button" onClick={addToCart} className="pill pill-primary">
              {t("shop.addToCart")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
