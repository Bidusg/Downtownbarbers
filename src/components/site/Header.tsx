"use client";

import { useEffect, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/site/LogoMark";
import { salon } from "@/lib/data/salon";
import { LoginModal } from "@/components/site/LoginModal";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useSectionFlags } from "@/components/site/SectionFlagsProvider";
import { SITE_SECTIONS } from "@/lib/site-sections-config";

function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
  );
}

// Rekkefølge følger hvor seksjonene ligger på forsiden (topp → bunn).
// labelKey slås opp i ordboken slik at navigasjonen bytter språk.
const nav = [
  { labelKey: "nav.team", href: "/#team" },
  { labelKey: "nav.tjenester", href: "/#tjenester" },
  { labelKey: "nav.handverket", href: "/#handverket" },
  { labelKey: "nav.galleri", href: "/#galleri" },
  { labelKey: "nav.butikk", href: "/butikk" },
  { labelKey: "nav.kontakt", href: "/#kontakt" },
];

export function Header({
  overlay = false,
  phone = salon.phone,
  address = salon.address,
}: {
  overlay?: boolean;
  phone?: string;
  address?: string;
}) {
  const { lang, setLang, t } = useLanguage();
  // Skjul navbar-lenker til seksjoner som er skrudd av i admin.
  const sectionFlags = useSectionFlags();
  const hiddenNavHrefs = new Set(
    SITE_SECTIONS.filter((s) => s.nav && sectionFlags[s.key] === false).map(
      (s) => s.nav as string,
    ),
  );
  const visibleNav = nav.filter((n) => !hiddenNavHrefs.has(n.href));
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginFlags, setLoginFlags] = useState({ accessDenied: false, passwordReset: false, staffTab: false });
  // ?login=1 (fra gamle /logg-inn-lenker, tilgangsvakter og utlogging):
  // åpne innloggings-popupen med en gang, og rydd adresselinja.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("login") !== "1") return;
    setLoginFlags({
      accessDenied: q.get("feil") === "tilgang",
      passwordReset: q.get("tilbakestilt") === "1",
      staffTab: q.get("ansatt") === "1",
    });
    setLoginOpen(true);
    ["login", "feil", "tilbakestilt", "neste", "ansatt"].forEach((k) => q.delete(k));
    const rest = q.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  }, []);
  const [scrolled, setScrolled] = useState(false);
  // Skjul headeren når man har scrollet forbi hero og scroller NEDOVER; vis den
  // straks man scroller opp igjen. Over hero er den alltid synlig.
  const [hidden, setHidden] = useState(false);

  const telHref = `tel:${phone.replace(/\s/g, "")}`;
  const shortAddress = address.split(",")[0];
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;

  useEffect(() => {
    if (!overlay) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      // Forbi hero (ca. 75% av skjermhøyden) + scroller nedover → skjul.
      // Scroller oppover, eller fortsatt i hero → vis.
      const pastHero = y > Math.max(320, window.innerHeight * 0.75);
      if (pastHero && y > lastY + 4) setHidden(true);
      else if (y < lastY - 4 || !pastHero) setHidden(false);
      lastY = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  // Åpen mobilmeny skal aldri være skjult.
  const headerHidden = hidden && !open;

  // overlay=false (vanlige sider): alltid solid, i flyt (sticky).
  // overlay=true (forsiden): gjennomsiktig over hero, solid ved scroll (fixed).
  const solid = !overlay || scrolled || open;
  // Logofarge: hvit over hero, text-fg (temaavhengig) på solid bar.
  const brand = solid ? "text-fg" : "text-white";
  const navText = solid
    ? "text-muted hover:text-fg"
    : "text-white/75 hover:text-white";
  const bar = solid ? "bg-fg" : "bg-white";

  return (
    <>
    <header
      className={
        (overlay ? "fixed" : "sticky") +
        // pt-safe: på iPhone går headeren helt opp under klokka/batteriet
        // (samme frostede glass), så innhold aldri synes over navbaren.
        " inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)] transition-[transform,background-color,border-color] duration-500 will-change-transform " +
        (solid
          ? "border-b border-line bg-canvas/85 backdrop-blur"
          : "border-b border-transparent bg-transparent") +
        (headerHidden ? " -translate-y-full" : " translate-y-0")
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/#top" aria-label="Downtown Barbers – til toppen">
          <LogoMark className={"h-11 transition-colors " + brand} />
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {visibleNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={"text-[13px] font-medium transition-colors " + navText}
            >
              {t(n.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className={
              "hidden items-center gap-1.5 text-[13px] font-medium transition-colors lg:inline-flex " +
              navText
            }
          >
            <PinIcon className="h-4 w-4" />
            {shortAddress}
          </a>
          <a
            href={telHref}
            aria-label={`Ring Downtown Barbers på ${phone}`}
            title={phone}
            className={
              "inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors " +
              navText
            }
          >
            <PhoneIcon className="h-5 w-5" />
          </a>
          {/* Språkbytte NO | EN */}
          <div
            role="group"
            aria-label={t("header.langLabel")}
            className={
              "flex items-center gap-1 text-[13px] font-medium transition-colors " +
              navText
            }
          >
            <button
              type="button"
              onClick={() => setLang("no")}
              aria-pressed={lang === "no"}
              className={
                "px-1 transition-opacity " +
                (lang === "no"
                  ? (solid ? "text-fg" : "text-white") + " font-semibold"
                  : "opacity-55 hover:opacity-100")
              }
            >
              NO
            </button>
            <span aria-hidden className="opacity-40">
              |
            </span>
            <button
              type="button"
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
              className={
                "px-1 transition-opacity " +
                (lang === "en"
                  ? (solid ? "text-fg" : "text-white") + " font-semibold"
                  : "opacity-55 hover:opacity-100")
              }
            >
              EN
            </button>
          </div>

          <a
            href="/?login=1"
            onClick={(e) => {
              e.preventDefault();
              setLoginOpen(true);
            }}
            className={
              "hidden items-center gap-1.5 text-[13px] font-medium transition-colors sm:inline-flex " +
              navText
            }
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
            </svg>
            {t("header.login")}
          </a>
          <Link
            href="/booking"
            className="shine-btn hidden bg-accent-soft px-5 py-2.5 text-[13px] font-semibold text-[#211E1A] transition-transform hover:-translate-y-0.5 sm:inline-block"
          >
            {t("header.book")}
          </Link>

          {/* Hamburger – kun mobil */}
          <button
            type="button"
            aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          >
            <span
              className={
                "block h-0.5 w-6 transition-transform " +
                bar +
                (open ? " translate-y-2 rotate-45" : "")
              }
            />
            <span
              className={
                "block h-0.5 w-6 transition-opacity " +
                bar +
                (open ? " opacity-0" : "")
              }
            />
            <span
              className={
                "block h-0.5 w-6 transition-transform " +
                bar +
                (open ? " -translate-y-2 -rotate-45" : "")
              }
            />
          </button>
        </div>
      </div>

      {/* Mobilmeny */}
      {open && (
        <nav className="border-t border-line bg-canvas px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {visibleNav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-3 text-sm font-medium text-fg last:border-0"
              >
                {t(n.labelKey)}
              </Link>
            ))}
            <Link
              href="/booking"
              onClick={() => setOpen(false)}
              className="mt-3 bg-accent-soft px-5 py-3 text-center text-sm font-semibold text-[#211E1A]"
            >
              {t("header.book")}
            </Link>
            <a
              href="/?login=1"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                setLoginOpen(true);
              }}
              className="mt-2 border border-line-2 px-5 py-3 text-center text-sm font-semibold text-fg"
            >
              {t("header.login")}
            </a>
            <a
              href={telHref}
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center gap-2 text-sm font-medium text-fg"
            >
              <PhoneIcon className="h-4 w-4 text-accent-soft" />
              {phone}
            </a>
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center gap-2 text-sm font-medium text-fg"
            >
              <PinIcon className="h-4 w-4 text-accent-soft" />
              {address}
            </a>
          </div>
        </nav>
      )}
    </header>
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} {...loginFlags} />
    </>
  );
}
