"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/shop/CartProvider";

/** Tømmer handlekurven når ordren er bekreftet, og sjekker Vipps på nytt mens den venter. */
export function OrderClient({ clearCart, poll, live = false }: { clearCart: boolean; poll: boolean; live?: boolean }) {
  const { clear, ready } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (clearCart && ready) clear();
  }, [clearCart, ready, clear]);

  useEffect(() => {
    if (!poll) return;
    let n = 0;
    const iv = window.setInterval(() => {
      n += 1;
      if (n > 20) return window.clearInterval(iv);
      router.refresh();
    }, 3000);
    return () => window.clearInterval(iv);
  }, [poll, router]);

  // Mens ordren behandles: oppdater fremdriften av seg selv (hvert 20. sek, i maks 1 time).
  useEffect(() => {
    if (!live || poll) return;
    let n = 0;
    const iv = window.setInterval(() => {
      n += 1;
      if (n > 180) return window.clearInterval(iv);
      if (document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => window.clearInterval(iv);
  }, [live, poll, router]);

  return null;
}
