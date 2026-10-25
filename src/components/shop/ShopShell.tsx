"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { CartProvider, useCart } from "@/components/shop/CartProvider";
import { cartSubtotal, kr, type ShopProduct, type WebshopSettings } from "@/lib/shop-shared";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * Ramme rundt hele nettbutikken: produktdata, handlekurv, handlekurv-
 * skuffen (åpnes når noe legges i kurven) og «Handlekurv»-knappen.
 * ===================================================================== */

type ShopData = { products: ShopProduct[]; bySlug: Map<string, ShopProduct>; byId: Map<string, ShopProduct>; settings: WebshopSettings };
const DataCtx = createContext<ShopData | null>(null);

export function useShopData(): ShopData {
  const d = useContext(DataCtx);
  if (!d) throw new Error("useShopData må brukes inne i ShopShell");
  return d;
}

export function ShopShell({
  products,
  settings,
  children,
}: {
  products: ShopProduct[];
  settings: WebshopSettings;
  children: ReactNode;
}) {
  const data = useMemo<ShopData>(
    () => ({
      products,
      bySlug: new Map(products.map((p) => [p.slug, p])),
      byId: new Map(products.map((p) => [p.id, p])),
      settings,
    }),
    [products, settings],
  );
  return (
    <DataCtx.Provider value={data}>
      <CartProvider>
        {children}
        <CartDrawer />
        <FloatingCart />
      </CartProvider>
    </DataCtx.Provider>
  );
}

/* ---------- Ikoner ---------- */
export function BagIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

/** Knapp som åpner handlekurven (brukes i butikk-linjen). */
export function CartButton({ className = "" }: { className?: string }) {
  const { count, setOpen, ready } = useCart();
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={"relative inline-flex min-h-11 items-center gap-2 rounded-full bg-fg px-4 text-sm font-semibold text-canvas " + className}
      aria-label={`${t("shop.cart")} (${count})`}
    >
      <BagIcon />
      <span className="hidden sm:inline">{t("shop.cart")}</span>
      {ready && count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-soft px-1 text-[11px] font-bold text-[#1d1a17] tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

/** Flytende handlekurv nederst til høyre når noe ligger i kurven. */
function FloatingCart() {
  const { count, ready, open } = useCart();
  const path = usePathname();
  if (!ready || count === 0 || open || /\/(handlekurv|ordre)/.test(path ?? "")) return null;
  return (
    <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 sm:right-6 sm:bottom-6">
      <CartButton className="shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)]" />
    </div>
  );
}

/* ---------- Fri frakt-måler ---------- */
export function FreeShippingBar({ subtotal }: { subtotal: number }) {
  const { settings } = useShopData();
  const { t } = useLanguage();
  if (!settings.ship) return null;
  const left = Math.max(0, settings.freeOverNok - subtotal);
  const pct = Math.min(100, Math.round((subtotal / Math.max(1, settings.freeOverNok)) * 100));
  return (
    <div>
      <p className="text-[13px] text-fg">
        {left > 0 ? (
          <>
            {t("shop.freeShipLeft").replace("{kr}", kr(left))}
          </>
        ) : (
          <span className="font-semibold">{t("shop.freeShipDone")}</span>
        )}
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent-soft transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Mengde-velger ---------- */
export function QtyStepper({
  qty,
  max,
  onChange,
  label,
}: {
  qty: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const btn = "flex h-9 w-9 items-center justify-center text-lg text-fg disabled:opacity-30";
  return (
    <div className="inline-flex items-center rounded-full shadow-[0_0_0_1px_oklch(var(--line-2))]" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(qty - 1)} aria-label="−1">
        −
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{qty}</span>
      <button type="button" className={btn} onClick={() => onChange(qty + 1)} disabled={qty >= max} aria-label="+1">
        +
      </button>
    </div>
  );
}

/** Forslag til mersalg: «passer godt med» fra kurven, ellers rimelige favoritter. */
export function useSuggestions(excludeIds: string[], seedSlugs: string[], limit = 3): ShopProduct[] {
  const { products, bySlug } = useShopData();
  return useMemo(() => {
    const ex = new Set(excludeIds);
    const out: ShopProduct[] = [];
    const push = (p?: ShopProduct) => {
      if (p && !ex.has(p.id) && p.stock > 0 && !out.some((o) => o.id === p.id)) out.push(p);
    };
    for (const s of seedSlugs) push(bySlug.get(s));
    if (out.length < limit) {
      // Rimelige tillegg (kam, barberblad, pudder …) – lette «ta med»-kjøp.
      [...products]
        .filter((p) => p.price <= 250)
        .sort((a, b) => Number(b.featured) - Number(a.featured) || b.stock - a.stock)
        .forEach((p) => out.length < limit * 3 && push(p));
    }
    return out.slice(0, limit);
  }, [products, bySlug, excludeIds, seedSlugs, limit]);
}

/* ---------- Handlekurv-skuff ---------- */
function CartDrawer() {
  const { lines, open, setOpen, setQty, remove, add, justAdded } = useCart();
  const { byId } = useShopData();
  const { t } = useLanguage();
  const subtotal = cartSubtotal(lines);

  const seeds = useMemo(() => {
    const first = justAdded ? byId.get(justAdded) : null;
    const all = lines.flatMap((l) => byId.get(l.id)?.related ?? []);
    return [...(first?.related ?? []), ...all];
  }, [lines, justAdded, byId]);
  const suggestions = useSuggestions(
    lines.map((l) => l.id),
    seeds,
    3,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen]);

  if (!open) return null;
  const added = justAdded ? lines.find((l) => l.id === justAdded) : null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <button type="button" aria-label={t("shop.close")} className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
      <aside className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-canvas shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="cart-title" className="text-lg font-semibold tracking-tight">
            {t("shop.cart")}
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="px-2 text-2xl leading-none text-muted hover:text-fg" aria-label={t("shop.close")}>
            ×
          </button>
        </header>

        {added && (
          <p role="status" className="flex items-center gap-2 bg-accent-soft/12 px-5 py-2.5 text-sm font-medium text-fg">
            <span aria-hidden>✓</span> {t("shop.added")}
          </p>
        )}

        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-muted">{t("shop.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.id} className="flex gap-3 py-3">
                  <Thumb src={l.image} alt={l.name} />
                  <div className="min-w-0 flex-1">
                    {l.brand && <p className="text-[11px] tracking-wide text-muted uppercase">{l.brand}</p>}
                    <Link href={`/butikk/${l.slug}`} onClick={() => setOpen(false)} className="line-clamp-2 text-[15px] font-medium text-fg hover:underline">
                      {l.name}
                    </Link>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <QtyStepper qty={l.qty} max={Math.max(1, Math.min(20, l.stock || 20))} onChange={(n) => setQty(l.id, n)} label={l.name} />
                      <span className="text-sm font-semibold tabular-nums">{kr(l.price * l.qty)}</span>
                    </div>
                    <button type="button" onClick={() => remove(l.id)} className="mt-1 text-xs text-muted underline hover:text-fg">
                      {t("shop.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {suggestions.length > 0 && (
            <section className="mt-6" aria-labelledby="cart-sugg">
              <h3 id="cart-sugg" className="mb-3 text-[13px] font-semibold text-muted">
                {t("shop.pairsWell")}
              </h3>
              <ul className="space-y-3">
                {suggestions.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Thumb src={p.images[0] ?? null} alt={p.name} small />
                    <div className="min-w-0 flex-1">
                      <Link href={`/butikk/${p.slug}`} onClick={() => setOpen(false)} className="line-clamp-1 text-sm font-medium text-fg hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted tabular-nums">{kr(p.price)}</p>
                    </div>
                    <button type="button" onClick={() => add(p)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]">
                      + {t("shop.add")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {lines.length > 0 && (
          <footer className="space-y-3 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <FreeShippingBar subtotal={subtotal} />
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{t("shop.subtotal")}</span>
              <span className="text-lg font-semibold tabular-nums">{kr(subtotal)}</span>
            </div>
            <Link href="/butikk/handlekurv" onClick={() => setOpen(false)} className="pill pill-primary w-full">
              {t("shop.toCheckout")}
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="w-full text-center text-sm text-muted underline hover:text-fg">
              {t("shop.continue")}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

export function Thumb({ src, alt, small = false }: { src: string | null; alt: string; small?: boolean }) {
  const size = small ? "h-12 w-12" : "h-20 w-20";
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="text-xs font-semibold text-muted" aria-hidden>
          {alt
            .split(/\s+/)
            .filter((w) => /^[A-Za-zÆØÅæøå]/.test(w))
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}
