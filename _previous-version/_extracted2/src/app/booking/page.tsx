import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { serviceCategories, team } from "@/lib/data/salon";

export const metadata = { title: "Bestill time | Downtown Barbers" };

export default function BookingPage() {
  const services = serviceCategories.flatMap((cat) =>
    cat.services.map((s) => ({
      name: s.name,
      price: s.price,
      duration: s.duration,
      category: cat.name,
    })),
  );
  const barbers = team.map((b) => ({ name: b.name, title: b.title }));

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
