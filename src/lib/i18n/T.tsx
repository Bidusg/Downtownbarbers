"use client";

// Klient-side oversettelses-komponenter for det offentlige nettstedet (Etappe 4).
//
// Disse kan brukes INNE i server-komponenter (en server-komponent kan rendre
// klient-komponenter). De leser gjeldende språk fra LanguageProvider.
//
// SSR/hydrering: provideren starter alltid på "no" (server + første klient-
// render er enige), og leser localStorage i en useEffect etterpå. Derfor
// matcher første render alltid serveren → ingen hydrerings-mismatch.
//
//   <T k="home.craft.title" />        – ordbok-oppslag (chrome/UI-tekst)
//   <TOr no="…" en="…" />             – engangs inline-tekst uten ordboknøkkel
//   <TDyn text="<norsk DB-verdi>" map="services" /> – oversett DB-innhold
//   <SplitRevealT k="…" … />          – animert tittel med oversatt tekst

import type { ComponentProps } from "react";
import { SplitReveal } from "@/components/site/motion/CineFx";
import { useLanguage } from "./LanguageProvider";
import { translateContent } from "./content-map";

/** Ordbok-oppslag for gjeldende språk (fallback: nøkkelens `no`, så nøkkelen). */
export function T({ k }: { k: string }) {
  const { t } = useLanguage();
  return <>{t(k)}</>;
}

/** Inline no/en-tekst uten ordboknøkkel. Viser `en` når språket er "en". */
export function TOr({ no, en }: { no: string; en: string }) {
  const { lang } = useLanguage();
  return <>{lang === "en" ? en : no}</>;
}

/** Oversett en norsk DB-verdi via et oversettelseskart; fallback = norsk tekst. */
export function TDyn({ text, map }: { text: string; map: string }) {
  const { lang } = useLanguage();
  return <>{translateContent(map, text, lang)}</>;
}

/** Animert tittel (SplitReveal) med tekst hentet fra ordboken. */
export function SplitRevealT({
  k,
  ...rest
}: { k: string } & Omit<ComponentProps<typeof SplitReveal>, "text">) {
  const { t } = useLanguage();
  return <SplitReveal text={t(k)} {...rest} />;
}
