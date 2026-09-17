import { requireRole } from "@/lib/auth";
import { getMyStaffLink } from "@/lib/ansatt-queries";
import { AnsattNav } from "@/components/ansatt/AnsattNav";
import { LogoutButton } from "@/components/admin/LogoutButton";

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
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="font-display text-lg font-bold text-fg">
              Downtown
            </span>
            <span className="text-[9px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
              Ansatt
            </span>
          </div>
          <AnsattNav />
        </div>
        <div className="flex items-center gap-3">
          {link.staffName && (
            <span className="hidden rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft sm:inline">
              {link.staffName}
            </span>
          )}
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
