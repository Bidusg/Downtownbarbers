"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SectionFlags } from "@/lib/site-sections-config";

/* Gjør av/på-status for forside-seksjoner tilgjengelig for navbar m.m.
 * (settes server-side i layout, leses av klient-komponenter som Header). */
const Ctx = createContext<SectionFlags>({});

export function SectionFlagsProvider({
  flags,
  children,
}: {
  flags: SectionFlags;
  children: ReactNode;
}) {
  return <Ctx.Provider value={flags}>{children}</Ctx.Provider>;
}

export function useSectionFlags(): SectionFlags {
  return useContext(Ctx);
}
