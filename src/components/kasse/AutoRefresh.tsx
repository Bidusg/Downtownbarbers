"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Henter siden på nytt i bakgrunnen med jevne mellomrom (og når fanen får
 * fokus), så lister og tall holder seg ferske uten manuell oppdatering.
 * Kun server-data hentes på nytt – skjemaer/klienttilstand beholdes.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, seconds]);
  return null;
}
