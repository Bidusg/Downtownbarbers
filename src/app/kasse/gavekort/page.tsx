import { requireRole } from "@/lib/auth";
import { GiftCardScan } from "@/components/admin/GiftCardScan";

export const dynamic = "force-dynamic";

export default async function KasseGavekort() {
  await requireRole(["shop", "admin"]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Gavekort</h1>
        <p className="mt-1 text-sm text-muted">
          Skann eller skriv gavekortets strekkode/kode for å se saldoen, og
          innløs beløpet kunden betaler med.
        </p>
      </div>
      <GiftCardScan />
    </main>
  );
}
