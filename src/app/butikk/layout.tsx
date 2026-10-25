import type { ReactNode } from "react";
import Link from "next/link";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { BackToTop } from "@/components/site/BackToTop";
import { ShopShell } from "@/components/shop/ShopShell";
import { ShopNav } from "@/components/shop/ShopNav";
import { ShopClosed } from "@/components/shop/ShopClosed";
import { getShopProducts, getWebshopSettings, canPreviewShop } from "@/lib/shop";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

/* =====================================================================
 * NETTBUTIKK – ramme for alle /butikk-sider.
 *   Stengt (settings.webshop.live = false): kundene ser «Under arbeid»,
 *   mens admin/eier/kassa ser hele butikken med et forhåndsvisningsbånd.
 * ===================================================================== */

export default async function ButikkLayout({ children }: { children: ReactNode }) {
  const [settings, preview] = await Promise.all([getWebshopSettings(), canPreviewShop()]);

  if (!settings.live && !preview) {
    return (
      <div className="cine cine-grain min-h-screen bg-canvas text-fg">
        <Header />
        <ShopClosed />
        <Footer />
      </div>
    );
  }

  const products = await getShopProducts();

  return (
    <div className="cine min-h-screen bg-canvas text-fg">
      <Header />
      {!settings.live && (
        <div className="bg-accent-soft/15 px-5 py-2 text-center text-[13px] text-fg">
          Forhåndsvisning – nettbutikken er ikke åpnet for kunder ennå.{" "}
          <Link href="/admin/produkter" className="font-semibold underline">
            Åpne den under Admin → Produkter
          </Link>
        </div>
      )}
      <ShopShell products={products} settings={settings}>
        <ShopNav />
        {children}
      </ShopShell>
      <Footer />
      <BackToTop />
    </div>
  );
}
