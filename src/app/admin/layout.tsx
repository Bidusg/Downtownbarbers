import { redirect } from "next/navigation";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { adminNav } from "@/lib/backoffice-nav";
import { getUserRole } from "@/lib/auth";
import { getActiveNotices } from "@/lib/notices-queries";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getUserRole();
  if (!me) redirect("/logg-inn");
  if (me.role !== "admin") redirect("/logg-inn?feil=tilgang");

  const initial = (me.email ?? "K").charAt(0).toUpperCase();
  const notices = await getActiveNotices("admin");

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <Topbar
        role="Admin"
        homeHref="/admin"
        nav={adminNav}
        search
        email={me.email}
        initial={initial}
      />
      <CommandPalette />
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
