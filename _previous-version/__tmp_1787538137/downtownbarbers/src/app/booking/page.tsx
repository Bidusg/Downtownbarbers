import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { getPublicServices, getPublicBarbers } from "@/lib/queries";

export const metadata = { title: "Bestill time | Downtown Barbers" };

export default async function BookingPage() {
  const [services, barbers] = await Promise.all([
    getPublicServices(),
    getPublicBarbers(),
  ]);

  return (
    <div className="bg-canvas text-fg">
      <Header />
      <section className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
          Bestill time
        </p>
        <h1 className="mt-4 mb-10 font-display text-4xl font-bold sm:text-5xl">
          Book din neste klipp
        </h1>
        <BookingWizard services={services} barbers={barbers} />
      </section>
      <Footer />
    </div>
  );
}
