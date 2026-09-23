import { requireRole } from "@/lib/auth";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { kasseNav } from "@/lib/backoffice-nav";

export default async function KasseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["shop", "admin"]);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <Topbar role="Kasse" homeHref="/kasse" nav={kasseNav} />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
