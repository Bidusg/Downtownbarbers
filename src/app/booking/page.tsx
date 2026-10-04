import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SmoothScroll, FadeUp } from "@/components/site/motion/CineFx";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { getPublicServices, getPublicBarbers } from "@/lib/queries";
import {
  getPublicServiceExclusions,
  getPublicLevelPrices,
  getPublicBarberLevels,
} from "@/lib/service-catalog-queries";
import { getPublicAddons } from "@/lib/addon-queries";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata = { title: "Bestill time | Downtown Barbers" };

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; barber?: string }>;
}) {
  const sp = await searchParams;
  const [services, barbers, addons, exclusions, levelPrices, barberLevels, settings] =
    await Promise.all([
      getPublicServices(),
      getPublicBarbers(),
      getPublicAddons(),
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
    <SmoothScroll>
      <div className="cine cine-grain min-h-screen bg-canvas text-fg">
        <Header />
        <section className="mx-auto max-w-3xl px-5 pt-28 pb-20 sm:pt-32">
          <FadeUp>
            <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">
              Bestill time
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1] sm:text-5xl">
              Sett deg ned.
            </h1>
            <p className="mt-5 max-w-md text-muted">
              Fire steg: tjeneste, barber, tid og kontakt. Bekreftelse på e-post
              med en gang.
            </p>
          </FadeUp>
          <div className="mt-10">
            <BookingWizard
              services={services}
              barbers={barbers}
              addons={addons}
              exclusions={exclusions}
              levelPrices={levelPrices}
              barberLevels={barberLevels}
              closedWeekdays={closedWeekdays}
              initialServiceName={sp.service}
              initialBarberName={sp.barber}
            />
          </div>
        </section>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
