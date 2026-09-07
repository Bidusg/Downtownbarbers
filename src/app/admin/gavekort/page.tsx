import { GiftCardManager } from "@/components/admin/GiftCardManager";
import { getGiftCards } from "@/lib/ops-queries";

export default async function AdminGavekort() {
  const cards = await getGiftCards();
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Gavekort</h1>
      <p className="mb-6 text-sm text-muted">
        Utsted gavekort og innløs saldo når kunden betaler med dem.
      </p>
      <GiftCardManager cards={cards} />
    </div>
  );
}
