import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerFilterPanel } from "@/components/admin/CustomerFilterPanel";
import { getFilterBarbers } from "@/lib/customer-filter";

export const dynamic = "force-dynamic";

export default async function KundeFilterPage() {
  const barbers = await getFilterBarbers();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Filtrer kunder"
        description="Finn kunder etter hvilken barber som har klippet dem, samtykke, siste besøk og forbruk. Stable flere filtre for å snevre inn."
        actions={
          <Link href="/admin/kunder" className="text-sm text-muted hover:text-fg">
            ← Alle kunder
          </Link>
        }
      />
      <CustomerFilterPanel barbers={barbers} />
    </div>
  );
}
