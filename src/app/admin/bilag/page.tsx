import { getVouchers } from "@/lib/vouchers-queries";
import { VoucherManager } from "@/components/admin/VoucherManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

// Tilgang er allerede voktet av admin-layouten (isAdminRole), som for
// dokumenter – ingen ekstra vakt nødvendig her.
export default async function AdminBilag() {
  const vouchers = await getVouchers();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Bilag til revisor"
        description="Last opp fakturaer, kvitteringer og bilag. De dukker automatisk opp hos revisor – ingen manuell utsending. Filene lagres privat, og nedlasting skjer via tidsbegrensede lenker."
      />

      <VoucherManager vouchers={vouchers} />

      <p className="text-xs text-muted">
        Arkivet er privat. Nedlasting skjer via en signert lenke som er gyldig i
        60 sekunder. Store filer kan avvises av serverens grense for
        opplastingsstørrelse.
      </p>
    </div>
  );
}
