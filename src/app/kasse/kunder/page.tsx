import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getCustomers } from "@/lib/admin-queries";
import { CustomerTable } from "@/components/admin/CustomerTable";

export const dynamic = "force-dynamic";

export default async function KasseKunder() {
  await requireRole(["shop", "admin"]);
  const customers = await getCustomers();

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Downtown Barbers
          </p>
          <p className="font-display text-lg font-bold">Kunder</p>
        </div>
        <Link href="/kasse" className="text-sm text-muted hover:text-fg">
          ← Kasse
        </Link>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="font-display text-xl font-bold">Kundekartotek</h1>
          <span className="text-sm text-muted">{customers.length} kunder</span>
        </div>
        <CustomerTable customers={customers} basePath="/kasse/kunder" />
      </main>
    </div>
  );
}
