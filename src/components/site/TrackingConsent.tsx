"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type { TrackingConfig } from "@/lib/tracking";

/* =====================================================================
 * Cookie-samtykke + lasting av Google Analytics / Google Ads / Meta piksel.
 *   • Ingenting lastes før besøkende har valgt (ekomloven § 3-15).
 *   • «Kun nødvendige» er like enkelt som «Godta alle».
 *   • Valget lagres i 6 måneder (dtb_consent) og kan endres via lenken
 *     «Informasjonskapsler» i bunnteksten.
 *   • Vises bare på de offentlige sidene – ikke i admin/kasse/ansatt.
 *   • Er ingen ID-er satt i admin, vises ingenting.
 * ===================================================================== */

const COOKIE = "dtb_consent";
const MAX_AGE = 60 * 60 * 24 * 182;
const BACKOFFICE = /^\/(admin|kasse|ansatt|revisor)(\/|$)/;

type Consent = { a: boolean; m: boolean };

function readConsent(): Consent | null {
  try {
    const m = /(?:^|;\s*)dtb_consent=([^;]+)/.exec(document.cookie);
    if (!m) return null;
    const v = JSON.parse(decodeURIComponent(m[1])) as Partial<Consent>;
    return { a: !!v.a, m: !!v.m };
  } catch {
    return null;
  }
}

function writeConsent(c: Consent) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify({ ...c, v: 1, t: Date.now() }))}; path=/; max-age=${MAX_AGE}; samesite=lax${secure}`;
}

/** Fjern sporings-cookies når samtykket trekkes tilbake. */
function clearTrackingCookies() {
  const host = location.hostname;
  const domains = ["", host, "." + host, "." + host.replace(/^www\./, "")];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || !/^(_ga|_gid|_gat|_gcl|_fbp|_fbc)/.test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; path=/; max-age=0${d ? `; domain=${d}` : ""}`;
    }
  }
}

const loaded = { gtag: false, meta: false };

function loadScripts(cfg: TrackingConfig, c: Consent) {
  const w = window;
  const wantGa = c.a && !!cfg.ga4;
  const wantAds = c.m && !!cfg.adsId;
  if ((wantGa || wantAds) && !loaded.gtag) {
    loaded.gtag = true;
    w.dataLayer = w.dataLayer || [];
    // eslint-disable-next-line prefer-rest-params
    w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); };
    w.gtag("consent", "default", {
      analytics_storage: c.a ? "granted" : "denied",
      ad_storage: c.m ? "granted" : "denied",
      ad_user_data: c.m ? "granted" : "denied",
      ad_personalization: c.m ? "granted" : "denied",
    });
    w.gtag("js", new Date());
    if (wantGa) w.gtag("config", cfg.ga4, { send_page_view: false });
    if (wantAds) {
      w.gtag("config", cfg.adsId, { send_page_view: false });
      w.__dtbAds = cfg.adsLabel ? { id: cfg.adsId, label: cfg.adsLabel } : null;
    }
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(wantGa ? cfg.ga4 : cfg.adsId)}`;
    document.head.appendChild(s);
  }
  if (c.m && cfg.metaPixel && !loaded.meta) {
    loaded.meta = true;
    // Meta sin offisielle oppstartskode (forenklet), uten automatisk sidevisning.
    type FbqFn = ((...a: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; loaded?: boolean; version?: string; push?: unknown };
    const f = function (...a: unknown[]) {
      if (f.callMethod) f.callMethod(...a);
      else (f.queue ??= []).push(a);
    } as FbqFn;
    f.push = f;
    f.loaded = true;
    f.version = "2.0";
    f.queue = [];
    w.fbq = f;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    w.fbq("init", cfg.metaPixel);
  }
}

function pageView(path: string) {
  try {
    window.gtag?.("event", "page_view", { page_path: path, page_location: location.href, page_title: document.title });
    window.fbq?.("track", "PageView");
  } catch {
    /* ignorer */
  }
}

export function TrackingConsent({ config }: { config: TrackingConfig }) {
  const pathname = usePathname() ?? "/";
  const { t } = useLanguage();
  const enabled = Boolean(config.ga4 || config.adsId || config.metaPixel);
  const hidden = BACKOFFICE.test(pathname);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [a, setA] = useState(false);
  const [m, setM] = useState(false);

  // Les tidligere valg etter hydrering; ingen valg → vis banneret.
  useEffect(() => {
    if (!enabled) return;
    (window as Window & { __dtbTrackingOn?: boolean }).__dtbTrackingOn = true;
    const c = readConsent();
    /* eslint-disable react-hooks/set-state-in-effect -- leser cookie etter hydrering */
    setConsent(c);
    if (c) {
      setA(c.a);
      setM(c.m);
    } else if (!hidden) setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const reopen = () => {
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener("dtb:consent-open", reopen);
    return () => window.removeEventListener("dtb:consent-open", reopen);
  }, [enabled, hidden]);

  // Last skript når samtykke finnes (aldri i back-office).
  useEffect(() => {
    if (!enabled || hidden || !consent) return;
    loadScripts(config, consent);
  }, [enabled, hidden, consent, config]);

  // Sidevisning ved hver sideovergang (Next navigerer uten ny sidelast).
  useEffect(() => {
    if (!enabled || hidden || !consent || !(consent.a || consent.m)) return;
    const id = window.setTimeout(() => pageView(pathname), 50);
    return () => window.clearTimeout(id);
  }, [pathname, enabled, hidden, consent]);

  const save = useCallback(
    (next: Consent) => {
      const before = consent;
      writeConsent(next);
      setConsent(next);
      setOpen(false);
      setCustom(false);
      // Trekker samtykke tilbake: skript kan ikke «avlastes» → rydd og last på nytt.
      if (before && ((before.a && !next.a) || (before.m && !next.m))) {
        clearTrackingCookies();
        location.reload();
      }
    },
    [consent],
  );

  if (!enabled || hidden || !open) return null;

  const statsNames = config.ga4 ? "Google Analytics" : "";
  const mktNames = [config.adsId ? "Google Ads" : "", config.metaPixel ? "Meta" : ""].filter(Boolean).join(", ");

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg rounded-[22px] bg-surface p-5 text-fg shadow-[0_24px_64px_-24px_rgba(0,0,0,0.45)] ring-1 ring-line sm:inset-x-auto sm:left-5 sm:bottom-5 sm:p-6"
    >
      <p id="consent-title" className="text-[17px] font-semibold tracking-tight">
        {t("consent.title")}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t("consent.text")}{" "}
        <Link href="/personvern" className="underline underline-offset-2 hover:text-fg">
          {t("consent.privacy")}
        </Link>
      </p>

      {custom && (
        <div className="mt-4 space-y-2">
          <label className="flex items-start gap-3 rounded-xl bg-canvas p-3">
            <input type="checkbox" checked disabled className="mt-1 h-4 w-4" />
            <span>
              <span className="block text-sm font-medium">{t("consent.necessary")}</span>
              <span className="block text-xs text-muted">{t("consent.necessaryHint")}</span>
            </span>
          </label>
          {config.ga4 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-canvas p-3">
              <input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} className="mt-1 h-4 w-4 accent-[#F47721]" />
              <span>
                <span className="block text-sm font-medium">{t("consent.stats")}</span>
                <span className="block text-xs text-muted">{t("consent.statsHint")} ({statsNames})</span>
              </span>
            </label>
          )}
          {mktNames && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-canvas p-3">
              <input type="checkbox" checked={m} onChange={(e) => setM(e.target.checked)} className="mt-1 h-4 w-4 accent-[#F47721]" />
              <span>
                <span className="block text-sm font-medium">{t("consent.marketing")}</span>
                <span className="block text-xs text-muted">{t("consent.marketingHint")} ({mktNames})</span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => save({ a: false, m: false })} className="pill pill-soft w-full">
          {t("consent.necessaryOnly")}
        </button>
        <button type="button" onClick={() => save({ a: true, m: true })} className="pill pill-dark w-full">
          {t("consent.acceptAll")}
        </button>
      </div>
      <div className="mt-2 text-center">
        {custom ? (
          <button type="button" onClick={() => save({ a, m })} className="m-link min-h-11 text-sm">
            {t("consent.save")}
          </button>
        ) : (
          <button type="button" onClick={() => setCustom(true)} className="m-link min-h-11 text-sm">
            {t("consent.customize")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Lenke i bunnteksten for å endre samtykket (vises bare når sporing er satt opp). */
export function ConsentLink({ className }: { className?: string }) {
  const { t } = useLanguage();
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Vent til TrackingConsent (i layouten) har meldt at sporing er satt opp.
    const id = window.setTimeout(
      () => setOn(!!(window as Window & { __dtbTrackingOn?: boolean }).__dtbTrackingOn),
      300,
    );
    return () => window.clearTimeout(id);
  }, []);
  if (!on) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("dtb:consent-open"))} className={className}>
      {t("footer.cookies")}
    </button>
  );
}
