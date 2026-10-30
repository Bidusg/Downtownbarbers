import type { Metadata, Viewport } from "next";
import { requireRole } from "@/lib/auth";
import { getMyStaffLink } from "@/lib/ansatt-queries";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { AppTabBar } from "@/components/ansatt/AppTabBar";
import { ansattNav } from "@/lib/backoffice-nav";

export const dynamic = "force-dynamic";

// Ansattdelen som app: egen manifest (installerbar «DTB Ansatt»), eget ikon
// og innhold helt ut i kantene (bunnmenyen tar hensyn til hjemlinjen).
export const metadata: Metadata = {
  manifest: "/app/ansatt.webmanifest",
  appleWebApp: { capable: true, title: "DTB Ansatt", statusBarStyle: "default" },
  icons: { apple: "/app/ansatt-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#F8F5EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function AnsattLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["staff", "admin"]);
  const link = await getMyStaffLink();

  return (
    <div className="bo-app min-h-screen overflow-x-clip bg-canvas pb-[calc(4rem+env(safe-area-inset-bottom))] text-fg md:pb-0">
      <Topbar
        role="Ansatt"
        homeHref="/ansatt"
        nav={ansattNav}
        badge={link.staffName}
        hideMobileMenu
      />
      <PageTransition>{children}</PageTransition>
      <AppTabBar />
    </div>
  );
}
