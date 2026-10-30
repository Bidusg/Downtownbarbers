"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Kobling mot app-skallet (DTB Ansatt, Capacitor). Gjør ingenting i en vanlig
 * nettleser. I appen:
 *  • Android tilbake-knapp: gå tilbake i appen, eller lukk appen på forsiden.
 *  • Lenker til andre nettsteder (kart, telefon, e-post) åpnes utenfor appen.
 * Capacitor sprøyter inn `window.Capacitor` når siden kjører i appen, så vi
 * trenger ingen ekstra pakke i nettsiden.
 */

type CapPlugins = {
  App?: {
    addListener: (
      ev: "backButton",
      cb: (e: { canGoBack: boolean }) => void,
    ) => Promise<{ remove: () => void }> | { remove: () => void };
    exitApp: () => void;
  };
};
type CapWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: CapPlugins };
};

export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    const cap = (window as CapWindow).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    document.documentElement.dataset.native = cap.getPlatform?.() ?? "native";

    let remove: (() => void) | undefined;
    const app = cap.Plugins?.App;
    if (app) {
      Promise.resolve(
        app.addListener("backButton", () => {
          if (window.location.pathname === "/ansatt" || window.history.length <= 1) app.exitApp();
          else router.back();
        }),
      ).then((h) => (remove = h.remove));
    }
    return () => remove?.();
  }, [router]);

  return null;
}
