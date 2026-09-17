import { requireRole } from "@/lib/auth";
import { KasseTopbar } from "@/components/kasse/KasseTopbar";

export default async function KasseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["shop", "admin"]);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <KasseTopbar />
      {children}
    </div>
  );
}
