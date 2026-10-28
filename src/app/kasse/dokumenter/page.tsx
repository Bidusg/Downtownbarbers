import { requireRole } from "@/lib/auth";
import { CompanyDocsList } from "@/components/docs/CompanyDocsList";

export const dynamic = "force-dynamic";

export default async function KasseDokumenter() {
  await requireRole(["shop", "admin"]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dokumenter</h1>
        <p className="mt-1 text-sm text-muted">Personalhåndbok og rutiner for salongen.</p>
      </div>
      <CompanyDocsList />
    </main>
  );
}
