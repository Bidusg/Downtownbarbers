import { requireRole } from "@/lib/auth";
import { getMyStaffLink } from "@/lib/ansatt-queries";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { ansattNav } from "@/lib/backoffice-nav";

export const dynamic = "force-dynamic";

export default async function AnsattLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["staff", "admin"]);
  const link = await getMyStaffLink();

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <Topbar
        role="Ansatt"
        homeHref="/ansatt"
        nav={ansattNav}
        badge={link.staffName}
      />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
