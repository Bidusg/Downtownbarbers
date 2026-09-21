import { GiftCardManager } from "@/components/admin/GiftCardManager";
import { GiftCardScan } from "@/components/admin/GiftCardScan";
import { getGiftCards } from "@/lib/ops-queries";

export default async function AdminGavekort() {
  const cards = await getGiftCards();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="mb-1 font-display text-2xl font-bold">Gavekort</h1>
        <p className="text-sm text-muted">
          Utsted gavekort og innløs saldo når kunden betaler med dem. Skann
          strekkoden for å hente opp saldoen raskt.
        </p>
      </div>
      <GiftCardScan />
      <GiftCardManager cards={cards} />
    </div>
  );
}
