"use client";

import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/admin": "Oversikt",
  "/admin/bookinger": "Bookinger",
  "/admin/tjenester": "Tjenester",
  "/admin/ansatte": "Ansatte",
  "/admin/kunder": "Kunder",
  "/admin/produkter": "Produkter",
  "/admin/regnskap": "Regnskap",
  "/admin/rating": "Rating",
};

export function Breadcrumb() {
  const path = usePathname();
  // Finn lengste matchende prefiks (så undersider også får riktig tittel)
  const key =
    Object.keys(titles)
      .filter((k) => (k === "/admin" ? path === "/admin" : path.startsWith(k)))
      .sort((a, b) => b.length - a.length)[0] ?? "/admin";
  const title = titles[key] ?? "Oversikt";
  const isRoot = key === "/admin";

  return (
    <p className="font-display text-lg font-bold">
      {!isRoot && <span className="text-muted">Admin / </span>}
      {title}
    </p>
  );
}
