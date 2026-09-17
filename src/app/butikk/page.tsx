import type { SVGProps } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
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
    <div className="bg-canvas text-fg">
      <Header />
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
          Produkter & gavekort
        </p>
        <h1 className="mt-4 mb-3 font-display text-4xl font-bold sm:text-5xl">
          Utvalget vårt
        </h1>
        <p className="mb-8 max-w-xl text-muted">
          Profesjonelle produkter vi bruker i stolen{" "}
          {hasGiftCards ? "– og gavekort som passer alle. " : ". "}
          Alt kjøpes i salongen: stikk innom eller ring, så legger vi det av til
          deg.
        </p>

        {/* Bevisst «kjøp i salongen»-tilstand slik at det ser intensjonelt ut,
            ikke som en halvferdig nettbutikk. */}
        <div className="mb-12 flex items-start gap-4 rounded-lg border border-line bg-surface p-5">
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

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
