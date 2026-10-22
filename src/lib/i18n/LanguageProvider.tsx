"use client";

// Klient-side språkkontekst for det offentlige nettstedet (Etappe 4).
// Standardspråk = norsk ("no"). Valget lagres i localStorage under "dtb_lang".
//
// SSR/hydrering: vi initialiserer alltid til "no" på første render (server +
// første klient-render er enige), og leser localStorage i en useEffect etterpå.
// Dermed unngår vi hydrerings-mismatch.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { dictionary, type Lang } from "./dictionary";
import type { TextOverrides } from "@/lib/site-texts-config";
import { translateContent } from "./content-map";

const STORAGE_KEY = "dtb_lang";

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  /** Oversett DB-innhold (tjenester, kategorier …) – engelske felt fra admin først. */
  tc: (map: string, text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  overrides = {},
  content = {},
}: {
  children: ReactNode;
  /** Admin-overstyringer av faste tekster (site_texts); ordboken er fallback. */
  overrides?: TextOverrides;
  /** Engelske tekster fra databasen per kart (f.eks. services.name_en). */
  content?: Record<string, Record<string, string>>;
}) {
  const [lang, setLangState] = useState<Lang>("no");

  // Les lagret valg etter første render (unngår hydrerings-mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "no" || stored === "en") setLangState(stored);
    } catch {
      /* localStorage utilgjengelig – behold standard "no". */
    }
  }, []);

  // Hold <html lang=…> i synk for tilgjengelighet/SEO når valget endres.
  useEffect(() => {
    try {
      document.documentElement.lang = lang === "en" ? "en" : "nb";
    } catch {
      /* ingen document – ignorer. */
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage utilgjengelig – behold i minnet. */
    }
  }, []);

  const t = useCallback(
    (key: string) => {
      // Admin-overstyring vinner; tom/mangler → ordboken; så nøkkelen.
      const ov = overrides[key];
      const entry = dictionary[key];
      return (ov && ov[lang]) || entry?.[lang] || entry?.no || key;
    },
    [lang, overrides],
  );

  const tc = useCallback(
    (map: string, text: string) => translateContent(map, text, lang, content[map]),
    [lang, content],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, tc }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Trygg fallback hvis en komponent brukes utenfor provideren.
    return {
      lang: "no",
      setLang: () => {},
      t: (key: string) => dictionary[key]?.no ?? key,
      tc: (_map: string, text: string) => text,
    };
  }
  return ctx;
}
