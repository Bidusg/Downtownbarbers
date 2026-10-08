import type { SVGProps } from "react";
import Link from "next/link";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BackToTop } from "@/components/site/BackToTop";
import { SmoothScroll, FadeUp } from "@/components/site/motion/CineFx";
import { TOr } from "@/lib/i18n/T";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

export const metadata = { title: "Under arbeid | Downtown Barbers" };

/* =====================================================================
 * NETTBUTIKK – MIDLERTIDIG «UNDER ARBEID»
 *   Butikksiden er bevisst satt i vedlikeholds-modus mens vi jobber på den,
 *   så kundene ikke bruker en halvferdig side. For å hente tilbake den ekte
 *   nettbutikken: gjenopprett forrige versjon av denne filen fra git
 *   (git history har hele butikk-siden med produktlisten).
 * ===================================================================== */

function WrenchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18l3 3 6.4-6.3a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-.6-.6-2.3 2.5-2.7z" />
    </svg>
  );
}

export default function ButikkPage() {
  return (
    <SmoothScroll>
      <div className="cine cine-grain min-h-screen bg-canvas text-fg">
        <Header />
        <section className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center sm:py-32">
          <FadeUp>
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft/12 text-accent-soft">
              <WrenchIcon className="h-8 w-8" />
            </span>
          </FadeUp>
          <FadeUp delay={0.05}>
            <p className="mt-6 text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">
              <TOr no="Nettbutikk" en="Online store" />
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
              <TOr no="Under arbeid" en="Under construction" />
            </h1>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p className="mt-5 max-w-xl text-muted">
              <TOr
                no="Vi pusser opp nettbutikken akkurat nå og har stengt den en liten stund. Du får fortsatt produkter, gavekort og klipp hos oss i salongen – kom innom eller bestill time."
                en="We're working on the online store right now and have closed it for a little while. You can still get products, gift cards and haircuts with us in the salon — drop by or book a time."
              />
            </p>
          </FadeUp>
          <FadeUp delay={0.2}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/booking"
                className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
              >
                <TOr no="Bestill time" en="Book appointment" />
              </Link>
              <Link
                href="/"
                className="rounded-md border border-line-2 px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
              >
                <TOr no="Til forsiden" en="Back to home" />
              </Link>
            </div>
          </FadeUp>
        </section>
        <Footer />
      </div>
      <BackToTop />
    </SmoothScroll>
  );
}
