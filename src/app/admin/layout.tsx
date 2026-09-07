import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
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
    <div className="min-h-screen bg-canvas text-fg">
      <AdminNav email={me.email} initial={initial} />
      <main className="px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
