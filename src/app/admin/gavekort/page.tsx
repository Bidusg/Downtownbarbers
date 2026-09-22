import { GiftCardManager } from "@/components/admin/GiftCardManager";
import { GiftCardScan } from "@/components/admin/GiftCardScan";
import { getGiftCards } from "@/lib/ops-queries";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function AdminGavekort() {
  const cards = await getGiftCards();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Gavekort"
        description="Utsted gavekort og innløs saldo når kunden betaler med dem. Skann strekkoden for å hente opp saldoen raskt."
      />
      <GiftCardScan />
      <GiftCardManager cards={cards} />
    </div>
  );
}
