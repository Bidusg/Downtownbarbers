import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, TBody, Tr, Td, TableEmpty } from "@/components/ui/Table";
import { SettlementManager } from "@/components/admin/SettlementManager";
import { DailyReconciliation } from "@/components/admin/DailyReconciliation";
import {
  getCashSettlements,
  getSalesTotalForDate,
  getDiscountTotalForDate,
  getDailyReconciliation,
} from "@/lib/ops-queries";
import { getSalesByMethodToday } from "@/lib/dashboard-queries";

const RECON_DAYS = 30;

/** Eldste dato i et {days}-dagers vindu t.o.m. {endDate} (UTC yyyy-mm-dd). */
function windowStartFor(endDate: string, days: number): string {
  const d = new Date(`${endDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

const methodLabel: Record<string, string> = {
  cash: "Kontant",
  kontant: "Kontant",
  card: "Kort",
  kort: "Kort",
  vipps: "Vipps",
};

export default async function AdminKasseoppgjor() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Oslo",
  });
  const [settlements, todaySales, todayDiscount, byMethod, reconRows] =
    await Promise.all([
      getCashSettlements(),
      getSalesTotalForDate(today),
      getDiscountTotalForDate(today),
      getSalesByMethodToday(),
      getDailyReconciliation(today, RECON_DAYS),
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Kasseoppgjør"
        description="Dagens salg kommer automatisk inn fra kassen. Registrer et dagsoppgjør for å avstemme mot faktisk kontant/kort. Beløp er inkl. mva."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Registrert salg i dag"
          value={kr(todaySales)}
          sub="automatisk fra kassen, inkl. mva"
        />
        <StatTile
          label="Rabatt gitt i dag"
          value={kr(todayDiscount)}
          sub="samlet avslag på dagens salg"
        />
        <StatTile
          label="Oppgjør registrert"
          value={String(settlements.length)}
          sub="siste 180 dager"
        />
      </div>

      {/* Auto-fordeling på betalingsmåte */}
      <Card title="Dagens salg fordelt på betalingsmåte" padded={false}>
        <Table>
          <TBody>
            {byMethod.length === 0 ? (
              <TableEmpty colSpan={3}>Ingen salg registrert i dag enda.</TableEmpty>
            ) : (
              byMethod.map((m) => (
                <Tr key={m.method}>
                  <Td className="font-medium text-fg">
                    {methodLabel[m.method.toLowerCase()] ?? m.method}
                  </Td>
                  <Td muted>{m.count} salg</Td>
                  <Td align="right" className="font-display text-accent-soft">
                    {kr(m.nok)}
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <SettlementManager settlements={settlements} defaultDate={today} />

      <DailyReconciliation
        initialRows={reconRows}
        windowStart={windowStartFor(today, RECON_DAYS)}
        endDate={today}
        windowDays={RECON_DAYS}
      />
    </div>
  );
}
