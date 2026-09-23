import { getVouchers } from "@/lib/vouchers-queries";
import { VoucherList } from "@/components/revisor/VoucherList";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

// Tilgang er voktet av revisor-layouten (requireRole(["revisor","admin"])).
// Bilag som Dawit laster opp i admin dukker automatisk opp her. Lese-kun.
export default async function RevisorBilag() {
  const vouchers = await getVouchers();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Bilag"
        description="Fakturaer, kvitteringer og bilag lastet opp av salongen. Klikk «Last ned» for å hente en kopi. Lenkene er private og gyldige i 60 sekunder."
      />

      <VoucherList vouchers={vouchers} />
    </div>
  );
}
