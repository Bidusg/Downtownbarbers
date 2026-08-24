import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getPublicProducts } from "@/lib/queries";

export const metadata = { title: "Nettbutikk | Downtown Barbers" };

export default async function ButikkPage() {
  const products = await getPublicProducts();

  return (
    <div className="bg-canvas text-fg">
      <Header />
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
          Nettbutikk
        </p>
        <h1 className="mt-4 mb-3 font-display text-4xl font-bold sm:text-5xl">
          Produkter & gavekort
        </h1>
        <p className="mb-12 max-w-xl text-muted">
          Profesjonelle produkter vi bruker i stolen. Online kjøp kommer snart –
          i mellomtiden får du dem i salongen.
        </p>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="border border-line bg-surface">
              <div className="flex aspect-square items-center justify-center bg-surface-2">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-4xl text-line-2">
                    {p.is_gift_card ? "🎁" : "💈"}
                  </span>
                )}
              </div>
              <div className="p-4">
                {p.is_gift_card && (
                  <span className="text-[10px] font-semibold tracking-wide text-accent-soft uppercase">
                    Gavekort
                  </span>
                )}
                <p className="font-medium text-fg">{p.name}</p>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{p.description}</p>
                )}
                <p className="mt-3 font-display text-lg font-bold text-fg">
                  {p.price_nok} kr
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
