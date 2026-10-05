import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { siteUrl } from "@/lib/site-url";

export const viewport: Viewport = {
  themeColor: "#F8F5EF",
  // Lar innholdet (hero) fylle helt opp under statuslinja på mobil, så det
  // ikke blir en lys stripe mellom toppen av skjermen og headeren.
  viewportFit: "cover",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb">
      <head>
        {/* Fonter lastes via <link> (kjøretid) i stedet for next/font, så bygg ikke er avhengig av nett. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,700;1,500&display=swap"
        />
      </head>
      <body className="min-h-full">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
