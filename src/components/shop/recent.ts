"use client";

import { useEffect, useState } from "react";

/* «Nylig sett» – lagres i nettleseren (de 12 siste produktene). */
const KEY = "dtb_recent_v1";

export function rememberViewed(slug: string) {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
    const next = [slug, ...list.filter((s) => s !== slug)].slice(0, 12);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export function useRecentlyViewed(exclude?: string): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      const l = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- engangs-lesing etter hydrering
      setList(l.filter((s) => typeof s === "string" && s !== exclude));
    } catch {
      setList([]);
    }
  }, [exclude]);
  return list;
}
