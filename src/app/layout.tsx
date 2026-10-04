import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

export const viewport: Viewport = {
  themeColor: "#F8F5EF",
};

export const metadata: Metadata = {
  title: "Downtown Barbers | Oslo",
  description:
    "Barbershop i Osterhaus' gate, Oslo. Skarpe fades, skjegg og klassisk barbering — walk-in eller book på sekunder.",
  keywords: ["barbershop", "oslo", "hårklipp", "fade", "skjegg", "grooming"],
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
