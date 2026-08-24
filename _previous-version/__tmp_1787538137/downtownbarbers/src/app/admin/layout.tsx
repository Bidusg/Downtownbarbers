import { Sidebar } from "@/components/admin/Sidebar";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["admin"]);
  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
              Downtown Barbers
            </p>
            <p className="font-display text-lg font-bold">Oversikt</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
              Admin
            </span>
            <div className="flex h-9 w-9 items-center justify-center bg-accent font-display text-sm font-bold text-accent-fg">
              K
            </div>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
