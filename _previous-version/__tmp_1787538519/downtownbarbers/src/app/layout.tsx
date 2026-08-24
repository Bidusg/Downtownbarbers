import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F5EF" },
    { media: "(prefers-color-scheme: dark)", color: "#211E1A" },
  ],
};

export const metadata: Metadata = {
  title: "Downtown Barbers | Oslo",
  description:
    "Der presisjon møter stil. Freshe klipper, skarpe fades og ekspert grooming — midt i hjertet av Oslo.",
  keywords: ["barbershop", "oslo", "hårklipp", "fade", "skjegg", "grooming"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb">
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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
