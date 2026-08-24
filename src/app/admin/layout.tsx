import { redirect } from "next/navigation";
import { Sidebar } from "@/components/admin/Sidebar";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getUserRole } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getUserRole();
  if (!me) redirect("/logg-inn");
  if (me.role !== "admin") redirect("/logg-inn?feil=tilgang");

  const initial = (me.email ?? "K").charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
              Downtown Barbers
            </p>
            <Breadcrumb />
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
              Admin
            </span>
            {me.email && (
              <span className="hidden text-xs text-muted sm:inline">
                {me.email}
              </span>
            )}
            <div className="flex h-9 w-9 items-center justify-center bg-accent font-display text-sm font-bold text-accent-fg">
              {initial}
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
