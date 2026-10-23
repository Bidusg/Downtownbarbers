import { requireRole } from "@/lib/auth";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { revisorNav } from "@/lib/backoffice-nav";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { getActiveNotices } from "@/lib/notices-queries";

export default async function RevisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["revisor", "admin"]);
  const notices = await getActiveNotices("revisor");

  return (
    <div className="bo-app min-h-screen overflow-x-clip bg-canvas text-fg">
      <Topbar role="Revisor" homeHref="/revisor" nav={revisorNav} />
      <main className="px-4 py-8 sm:px-6">
        {notices.length > 0 && (
          <div className="mx-auto mb-6 max-w-6xl">
            <NoticeBanner notices={notices} />
          </div>
        )}
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
