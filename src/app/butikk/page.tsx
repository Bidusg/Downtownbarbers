import type { SVGProps } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SmoothScroll, FadeUp } from "@/components/site/motion/CineFx";
import { ProductCard } from "@/components/butikk/ProductCard";
import { getPublicProducts } from "@/lib/queries";
import { T, SplitRevealT } from "@/lib/i18n/T";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

export const metadata = { title: "Nettbutikk | Downtown Barbers" };

function StoreIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 9.5 4.2 4.4A1 1 0 0 1 5.17 3.7h13.66a1 1 0 0 1 .97.7L21 9.5" />
      <path d="M4 9.5v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-10" />
      <path d="M3 9.5h18" />
      <path d="M9 20.5v-5.5h6v5.5" />
    </svg>
  );
}

export default async function ButikkPage() {
  const products = await getPublicProducts();
  const hasGiftCards = products.some((p) => p.is_gift_card);

  return (
    <SmoothScroll>
      <div className="cine cine-grain min-h-screen bg-canvas text-fg">
        <Header />
        <section className="mx-auto max-w-6xl px-5 pt-10 pb-20 sm:pt-16">
          <FadeUp>
            <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">
              <T k="butikk.eyebrow" />
            </p>
          </FadeUp>
          <SplitRevealT
            as="h1"
            k="butikk.title"
            className="mt-4 font-display text-4xl font-bold sm:text-5xl"
          />
          <FadeUp delay={0.06}>
            <p className="mt-5 mb-8 max-w-xl text-muted">
              <T k="butikk.intro.base" />
              {hasGiftCards ? (
                <T k="butikk.intro.gift" />
              ) : (
                <T k="butikk.intro.plain" />
              )}
              <T k="butikk.intro.tail" />
            </p>
          </FadeUp>

          {/* Bevisst «kjøp i salongen»-tilstand slik at det ser intensjonelt ut,
              ikke som en halvferdig nettbutikk. */}
          <FadeUp>
            <div className="mb-12 flex items-start gap-4 border border-line bg-surface p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft/12 text-accent-soft">
                <StoreIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium text-fg">
                  <T k="butikk.box.titleBase" />
                  {hasGiftCards ? <T k="butikk.box.titleGift" /> : ""}
                </p>
                <p className="mt-1 text-sm text-muted">
                  <T k="butikk.box.bodyProducts" />
                  {hasGiftCards ? <T k="butikk.box.bodyGift" /> : ""}
                  <T k="butikk.box.bodyTail" />
                </p>
              </div>
            </div>
          </FadeUp>

          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
