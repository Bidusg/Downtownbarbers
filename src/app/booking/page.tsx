import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { getPublicServices, getPublicBarbers } from "@/lib/queries";
import {
  getPublicServiceExclusions,
  getPublicLevelPrices,
  getPublicBarberLevels,
} from "@/lib/service-catalog-queries";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata = { title: "Bestill time | Downtown Barbers" };

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; barber?: string }>;
}) {
  const sp = await searchParams;
  const [services, barbers, exclusions, levelPrices, barberLevels, settings] =
    await Promise.all([
      getPublicServices(),
      getPublicBarbers(),
      getPublicServiceExclusions(),
      getPublicLevelPrices(),
      getPublicBarberLevels(),
      getSiteSettings(),
    ]);
  // Ukedager salongen er stengt (0=søndag … 6=lørdag) – styrer dagvalget i booking.
  const closedWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((dow) => {
    const h = settings.hours?.[String(dow)];
    return !h || !h.open || !h.close;
  });

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
        <BookingWizard
          services={services}
          barbers={barbers}
          exclusions={exclusions}
          levelPrices={levelPrices}
          barberLevels={barberLevels}
          closedWeekdays={closedWeekdays}
          initialServiceName={sp.service}
          initialBarberName={sp.barber}
        />
      </section>
      <Footer />
    </div>
  );
}
