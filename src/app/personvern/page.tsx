import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getSiteSettings } from "@/lib/site-settings";
import { PrivacyContent } from "./PrivacyContent";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

export const metadata = {
  title: "Personvern | Downtown Barbers",
  description:
    "Hvordan Downtown Barbers behandler personopplysninger ved booking, kjøp og markedsføring.",
};

export default async function PersonvernPage() {
  const s = await getSiteSettings();
  return (
    <div className="cine min-h-screen bg-canvas text-fg">
      <Header />
      <section className="mx-auto max-w-3xl px-5 pt-10 pb-20 sm:pt-16">
        <PrivacyContent
          company={s.name || "Downtown Barbers"}
          address={s.address}
          email={s.email ?? "post@downtownbarbers.no"}
          phone={s.phone}
        />
      </section>
      <Footer />
    </div>
  );
}
