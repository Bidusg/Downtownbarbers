import { requireRole } from "@/lib/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default async function RevisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["revisor", "admin"]);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-lg font-bold text-fg">Downtown</span>
          <span className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Revisor
          </span>
        </div>
        <LogoutButton />
      </header>
      <main className="px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
