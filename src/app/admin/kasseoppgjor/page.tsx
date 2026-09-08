import { StatTile } from "@/components/ui/StatTile";
import { SettlementManager } from "@/components/admin/SettlementManager";
import { getCashSettlements, getSalesTotalForDate } from "@/lib/ops-queries";
import { getSalesByMethodToday } from "@/lib/dashboard-queries";

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
  const [settlements, todaySales, byMethod] = await Promise.all([
    getCashSettlements(),
    getSalesTotalForDate(today),
    getSalesByMethodToday(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="mb-1 font-display text-2xl font-bold">Kasseoppgjør</h1>
        <p className="text-sm text-muted">
          Dagens salg kommer automatisk inn fra kassen. Registrer et dagsoppgjør
          for å avstemme mot faktisk kontant/kort. Beløp er inkl. mva.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Registrert salg i dag"
          value={kr(todaySales)}
          sub="automatisk fra kassen, inkl. mva"
        />
        <StatTile
          label="Oppgjør registrert"
          value={String(settlements.length)}
          sub="siste 180 dager"
        />
      </div>

      {/* Auto-fordeling på betalingsmåte */}
      <div className="border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
          Dagens salg fordelt på betalingsmåte
        </h2>
        {byMethod.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            Ingen salg registrert i dag enda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {byMethod.map((m) => (
                <tr key={m.method} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium text-fg">
                    {methodLabel[m.method.toLowerCase()] ?? m.method}
                  </td>
                  <td className="px-5 py-3 text-muted">{m.count} salg</td>
                  <td className="px-5 py-3 text-right font-display text-accent-soft">
                    {kr(m.nok)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SettlementManager settlements={settlements} defaultDate={today} />
    </div>
  );
}
