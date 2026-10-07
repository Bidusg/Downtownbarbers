import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { SectionFlagsProvider } from "@/components/site/SectionFlagsProvider";
import { getSectionFlags } from "@/lib/site-section-flags";
import { siteUrl } from "@/lib/site-url";

// Fontene ligger i repoet (src/fonts, OFL-lisens) og serveres fra vårt eget
// domene: null kall til Google fra besøkendes nettleser → ingen IP-deling,
// ingen cookie-/samtykkespørsmål for fonter – og bygget er ikke avhengig av
// nett. Variable fonter (ett filsett dekker alle vekter). Variablene plukkes
// opp i globals.css (--font-sans / --font-display).
const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-wght-normal.woff2", style: "normal" },
    { path: "../fonts/inter-latin-ext-wght-normal.woff2", style: "normal" },
  ],
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
const playfair = localFont({
  src: [
    { path: "../fonts/playfair-display-latin-wght-normal.woff2", style: "normal" },
    { path: "../fonts/playfair-display-latin-ext-wght-normal.woff2", style: "normal" },
    { path: "../fonts/playfair-display-latin-wght-italic.woff2", style: "italic" },
  ],
  weight: "400 900",
  variable: "--font-playfair",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#F8F5EF",
  width: "device-width",
  initialScale: 1,
  // Kundesidene (med site-Header) setter selv viewportFit:"cover" – se
  // PUBLIC_VIEWPORT i src/lib/public-viewport.ts. Admin/kasse bruker standard.
};

const DESCRIPTION =
  "Barbershop i Osterhaus' gate, Oslo. Skarpe fades, skjegg og klassisk barbering — walk-in eller book på sekunder.";

export const metadata: Metadata = {
  // metadataBase gjør at OG-bilde/ikoner får absolutte URL-er (kreves av
  // Facebook/Instagram/LinkedIn/iMessage for forhåndsvisning av lenker).
  metadataBase: new URL(siteUrl()),
  title: "Downtown Barbers | Oslo",
  description: DESCRIPTION,
  keywords: ["barbershop", "oslo", "hårklipp", "fade", "skjegg", "grooming", "barber oslo"],
  applicationName: "Downtown Barbers",
  openGraph: {
    type: "website",
    siteName: "Downtown Barbers",
    locale: "nb_NO",
    alternateLocale: ["en_GB"],
    title: "Downtown Barbers | Oslo",
    description: DESCRIPTION,
    // Selve bildet leveres av src/app/opengraph-image.jpg (Next kobler det på).
  },
  twitter: {
    card: "summary_large_image",
    title: "Downtown Barbers | Oslo",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sectionFlags = await getSectionFlags();
  return (
    <html lang="nb" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-full">
        <LanguageProvider>
          <SectionFlagsProvider flags={sectionFlags}>
            {children}
          </SectionFlagsProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
