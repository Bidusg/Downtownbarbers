import { getVouchers } from "@/lib/vouchers-queries";
import { VoucherList } from "@/components/revisor/VoucherList";

export const dynamic = "force-dynamic";

// Tilgang er voktet av revisor-layouten (requireRole(["revisor","admin"])).
// Bilag som Dawit laster opp i admin dukker automatisk opp her. Lese-kun.
export default async function RevisorBilag() {
  const vouchers = await getVouchers();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Bilag</h1>
        <p className="mt-1 text-sm text-muted">
          Fakturaer, kvitteringer og bilag lastet opp av salongen. Klikk «Last
          ned» for å hente en kopi. Lenkene er private og gyldige i 60 sekunder.
        </p>
      </div>

      <VoucherList vouchers={vouchers} />
    </div>
  );
}
