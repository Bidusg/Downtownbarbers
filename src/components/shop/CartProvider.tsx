"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartLine, ShopProduct } from "@/lib/shop-shared";

/* =====================================================================
 * HANDLEKURV (nettleseren). Lagres i localStorage, så den overlever at
 * kunden lukker fanen. Prisene her er bare til visning – serveren regner
 * alltid ut den ekte summen når ordren legges inn.
 * ===================================================================== */

const KEY = "dtb_cart_v1";

type CartCtx = {
  lines: CartLine[];
  count: number;
  ready: boolean;
  open: boolean;
  /** Sist lagt i kurven (for «Lagt i handlekurven»-visningen i skuffen). */
  justAdded: string | null;
  setOpen: (v: boolean) => void;
  add: (p: ShopProduct, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);

export function toLine(p: ShopProduct, qty = 1): CartLine {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    price: p.price,
    image: p.images[0] ?? null,
    stock: p.stock,
    qty,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- engangs-lesing etter hydrering
      if (raw) setLines((JSON.parse(raw) as CartLine[]).filter((l) => l && l.id && l.qty > 0));
    } catch {
      /* tom kurv */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* noop */
    }
  }, [lines, ready]);

  const add = useCallback((p: ShopProduct, qty = 1) => {
    setLines((ls) => {
      const max = Math.max(1, Math.min(20, p.stock || 20));
      const ex = ls.find((l) => l.id === p.id);
      if (ex) return ls.map((l) => (l.id === p.id ? { ...l, qty: Math.min(max, l.qty + qty), price: p.price, stock: p.stock } : l));
      return [...ls, toLine(p, Math.min(max, qty))];
    });
    setJustAdded(p.id);
    setOpen(true);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setLines((ls) =>
      qty <= 0
        ? ls.filter((l) => l.id !== id)
        : ls.map((l) => (l.id === id ? { ...l, qty: Math.min(Math.max(1, Math.min(20, l.stock || 20)), qty) } : l)),
    );
  }, []);

  const remove = useCallback((id: string) => setLines((ls) => ls.filter((l) => l.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartCtx>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      ready,
      open,
      justAdded,
      setOpen: (v) => {
        setOpen(v);
        if (!v) setJustAdded(null);
      },
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, ready, open, justAdded, add, setQty, remove, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart må brukes inne i CartProvider");
  return c;
}
