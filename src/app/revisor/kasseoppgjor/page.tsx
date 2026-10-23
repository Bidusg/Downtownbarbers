import { PageHeader } from "@/components/ui/PageHeader";
import { DailyReconciliation } from "@/components/admin/DailyReconciliation";
import { getDailyReconciliation } from "@/lib/ops-queries";

export const dynamic = "force-dynamic";

const RECON_DAYS = 30;

function windowStartFor(endDate: string, days: number): string {
  const d = new Date(`${endDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

// Tilgang voktes av revisor-layouten. Lese-kun: kassa registrerer oppgjøret,
// admin kan rette – revisor ser forventet, talt og avvik per dag (og PDF).
export default async function RevisorKasseoppgjor() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  const rows = await getDailyReconciliation(today, RECON_DAYS);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Kasseoppgjør"
        description="Dagsoppgjørene fra kassa: forventet salg per betalingsmåte, talt beløp og avvik. Last ned som PDF for perioden. Beløp er inkl. mva."
      />
      <DailyReconciliation
        initialRows={rows}
        windowStart={windowStartFor(today, RECON_DAYS)}
        endDate={today}
        windowDays={RECON_DAYS}
      />
    </div>
  );
}
