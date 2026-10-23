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
  // Innlogget kunde (flagg-cookie satt ved innlogging) → «Min side» i stedet for «Logg inn».
  const [isCustomer, setIsCustomer] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leser cookie etter hydrering
    setIsCustomer(/(?:^|;\s*)dtb_kunde_in=1(?:;|$)/.test(document.cookie));
  }, []);
  const [scrolled, setScrolled] = useState(false);

  // Mobilmeny: Esc lukker, og siden bak låses mens menyen er åpen.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const telHref = `tel:${phone.replace(/\s/g, "")}`;
  const shortAddress = address.split(",")[0];
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => {
      const y = window.scrollY;
      // Headeren er GJENNOMSIKTIG over hero (kun desktop) og blir solid (frostet)
      // når hero er nesten forbi. Headeren HENGER ALLTID MED – den skjules aldri,
      // så den glir jevnt (smooth) gjennom hele siden.
      setScrolled(y > Math.max(300, window.innerHeight - 120));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  // «over» = gjennomsiktig modus: på forsiden, over hero, før man har scrollet.
  // Gjelder ALLE skjermstørrelser (mobil som PC) – da ligger hero-bildet helt
  // opp til toppen uten en krem-stripe, nøyaktig slik det ser ut på PC. Når man
  // scroller forbi hero blir baren frostet. Den skjules aldri → henger smooth
  // med gjennom hele siden.
  const over = overlay && !scrolled && !open;
  // Over hero: hvit tekst på det mørke bildet. Ellers: temafarge på frostet bar.
  const brand = over ? "text-white" : "text-fg";
  const navText = over
    ? "text-white/75 hover:text-white"
    : "text-muted hover:text-fg";
  const langActive = over ? "text-white" : "text-fg";
  // Hamburger-strekene: hvite over hero, mørke på frostet bar.
  const bar = over ? "bg-white" : "bg-fg";

  return (
    <>
    <header
      className={
        (overlay ? "fixed" : "sticky") +
        // pt-safe: på iPhone går headeren helt opp under klokka/batteriet
        // (samme frostede glass), så innhold aldri synes over navbaren.
        " inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)] transition-colors duration-500 " +
        // Over hero (mobil som PC): helt gjennomsiktig, så hero-bildet går helt
        // opp til toppen uten krem-stripe. Scrollet forbi hero: frostet krembar.
        (over
          ? "border-b border-transparent bg-transparent"
          : "border-b border-line/60 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150")
      }
    >
      <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5">
        <Link href="/#top" aria-label="Downtown Barbers – til toppen">
          <LogoMark className={"h-10 transition-colors " + brand} />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {visibleNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={"text-[13px] font-normal tracking-[-0.01em] transition-colors " + navText}
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
                "min-h-11 px-2 transition-opacity " +
                (lang === "no"
                  ? langActive + " font-semibold"
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
                "min-h-11 px-2 transition-opacity " +
                (lang === "en"
                  ? langActive + " font-semibold"
                  : "opacity-55 hover:opacity-100")
              }
            >
              EN
            </button>
          </div>

          <a
            href={isCustomer ? "/min-side" : "/?login=1"}
            onClick={(e) => {
              if (isCustomer) return;
              e.preventDefault();
              setLoginOpen(true);
            }}
            className={
              "hidden items-center gap-1.5 text-[13px] font-medium transition-colors sm:inline-flex " +
              navText
            }
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {isCustomer ? (
                <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
              ) : (
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              )}
            </svg>
            {isCustomer ? t("header.mypage") : t("header.login")}
          </a>
          <Link
            href="/booking"
            className="pill pill-primary pill-sm hidden sm:inline-flex"
          >
            {t("header.book")}
          </Link>

          {/* Hamburger – kun mobil */}
          <button
            type="button"
            aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 md:hidden"
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

    </header>

    {/* Mobilmeny – fast overlegg som dekker HELE skjermen, så ingenting av siden
        bak noensinne synes gjennom uansett hvor langt man har scrollet. Ligger
        UTENFOR <header> (headeren har backdrop-blur, som ellers ville «fanget»
        et fixed-barn og klippet det). z-30 < header z-40 → logo + kryss i
        topplinja ligger alltid oppå og kan trykkes. */}
    {open && (
      <nav
        data-lenis-prevent
        aria-label="Meny"
        className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-canvas px-6 pb-10 pt-[calc(env(safe-area-inset-top)+5rem)] md:hidden"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-1">
          {visibleNav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="py-2.5 text-[1.75rem] font-semibold tracking-[-0.03em] text-fg"
            >
              {t(n.labelKey)}
            </Link>
          ))}
          <Link
            href="/booking"
            onClick={() => setOpen(false)}
            className="pill pill-primary mt-8"
          >
            {t("header.book")}
          </Link>
          <a
            href={isCustomer ? "/min-side" : "/?login=1"}
            onClick={(e) => {
              setOpen(false);
              if (isCustomer) return;
              e.preventDefault();
              setLoginOpen(true);
            }}
            className="pill pill-soft mt-3"
          >
            {isCustomer ? t("header.mypage") : t("header.login")}
          </a>
          <a
            href={telHref}
            onClick={() => setOpen(false)}
            className="mt-8 flex min-h-11 items-center gap-2 text-[15px] font-medium text-fg"
          >
            <PhoneIcon className="h-4 w-4 text-accent-ink" />
            {phone}
          </a>
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 text-[15px] font-medium text-fg"
          >
            <PinIcon className="h-4 w-4 text-accent-ink" />
            {address}
          </a>
        </div>
      </nav>
    )}
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} {...loginFlags} />
    </>
  );
}
