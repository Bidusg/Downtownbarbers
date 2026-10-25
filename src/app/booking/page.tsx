import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { SmoothScroll } from "@/components/site/motion/CineFx";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { getPublicServices, getPublicBarbers } from "@/lib/queries";
import {
  getPublicServiceExclusions,
  getPublicLevelPrices,
  getPublicBarberLevels,
} from "@/lib/service-catalog-queries";
import { getPublicAddons } from "@/lib/addon-queries";
import { getSiteSettings } from "@/lib/site-settings";
import { getMemberProfile } from "@/lib/member";
import { T } from "@/lib/i18n/T";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

export const metadata = { title: "Bestill time | Downtown Barbers" };

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; barber?: string }>;
}) {
  const sp = await searchParams;
  const [services, barbers, addons, exclusions, levelPrices, barberLevels, settings, member] =
    await Promise.all([
      getPublicServices(),
      getPublicBarbers(),
      getPublicAddons(),
      getPublicServiceExclusions(),
      getPublicLevelPrices(),
      getPublicBarberLevels(),
      getSiteSettings(),
      getMemberProfile(),
    ]);
  // Ukedager salongen er stengt (0=søndag … 6=lørdag) – styrer dagvalget i booking.
  const closedWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((dow) => {
    const h = settings.hours?.[String(dow)];
    return !h || !h.open || !h.close;
  });

  return (
    <SmoothScroll>
      <div className="cine min-h-screen bg-canvas text-fg">
        <Header />
        <main id="main" className="mx-auto max-w-3xl px-5 pt-8 pb-24 sm:pt-14">
          <div>
            <p className="m-eyebrow">
              <T k="booking.eyebrow" />
            </p>
            <h1 className="m-title mt-2 text-4xl sm:text-6xl">
              <T k="booking.heading" />
            </h1>
          </div>
          <div className="mt-10 sm:mt-14">
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
              address={settings.address}
              phoneNumber={settings.phone}
              member={member}
            />
          </div>
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
