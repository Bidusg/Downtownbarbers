import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { TermsContent } from "@/components/shop/TermsContent";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

export const metadata = {
  title: "Kjøpsvilkår | Downtown Barbers",
  description: "Kjøpsvilkår for nettbutikken til Downtown Barbers: priser, levering, betaling, angrerett, retur og reklamasjon.",
};

export default function KjopsvilkarPage() {
  return (
    <div className="cine min-h-screen bg-canvas text-fg">
      <Header />
      <article className="mx-auto max-w-3xl px-5 pt-10 pb-20 sm:pt-16">
        <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">Nettbutikk</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-fg">Kjøpsvilkår</h1>
        <TermsContent />
      </article>
      <Footer />
    </div>
  );
}
