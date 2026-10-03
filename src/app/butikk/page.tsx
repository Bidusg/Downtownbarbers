import type { SVGProps } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SmoothScroll, FadeUp, SplitReveal } from "@/components/site/motion/CineFx";
import { ProductCard } from "@/components/butikk/ProductCard";
import { getPublicProducts } from "@/lib/queries";

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
        <section className="mx-auto max-w-6xl px-5 pt-28 pb-20 sm:pt-32">
          <FadeUp>
            <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">
              Produkter & gavekort
            </p>
          </FadeUp>
          <SplitReveal
            as="h1"
            text="Over disk"
            className="mt-5 font-display text-5xl font-bold sm:text-7xl"
          />
          <FadeUp delay={0.06}>
            <p className="mt-5 mb-8 max-w-xl text-muted">
              De samme produktene vi bruker i stolen
              {hasGiftCards ? " – pluss gavekort som alltid sitter. " : ". "}
              Alt kjøpes i salongen: stikk innom eller ring, så legger vi det av
              til deg.
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
                  Kjøp i salongen{hasGiftCards ? " – også gavekort" : ""}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Vi selger produkter{hasGiftCards ? " og gavekort" : ""} direkte
                  over disk – ingen frakt og ingen ventetid. Nettbutikk med
                  betaling og levering er på vei; til da får du alt raskest ved å
                  komme innom.
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
