import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { getActiveNotices } from "@/lib/notices-queries";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getUserRole();
  if (!me) redirect("/logg-inn");
  if (!isAdminRole(me.role)) redirect("/logg-inn?feil=tilgang");

  const initial = (me.email ?? "K").charAt(0).toUpperCase();
  const notices = await getActiveNotices("admin");

  return (
    <AdminShell email={me.email} initial={initial}>
      <CommandPalette />
      {notices.length > 0 && (
        <div className="mx-auto mb-6 max-w-6xl">
          <NoticeBanner notices={notices} />
        </div>
      )}
      {children}
    </AdminShell>
  );
}
