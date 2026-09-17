import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
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
      <AdminNav email={me.email} initial={initial} />
      <CommandPalette />
      <main className="px-4 py-8 sm:px-6">
        {notices.length > 0 && (
          <div className="mx-auto mb-6 max-w-6xl">
            <NoticeBanner notices={notices} />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
