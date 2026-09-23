import { requireRole } from "@/lib/auth";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { revisorNav } from "@/lib/backoffice-nav";

export default async function RevisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["revisor", "admin"]);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <Topbar role="Revisor" homeHref="/revisor" nav={revisorNav} />
      <main className="px-4 py-8 sm:px-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
