import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { getInventory, getStockMovements } from "@/lib/inventory-queries";
import { StockScanAdjust } from "@/components/admin/StockScanAdjust";
import {
  QuickStock,
  SetStockForm,
  ThresholdForm,
  StockAdjustForm,
} from "@/components/admin/StockControls";
import { formatKr } from "@/lib/format";

export const dynamic = "force-dynamic";

const nok = formatKr;

const REASON_LABEL: Record<string, string> = {
  varemottak: "Varemottak",
  svinn: "Svinn",
  telling: "Opptelling",
  justering: "Justering",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AdminLager() {
  const [items, movements] = await Promise.all([getInventory(), getStockMovements(40)]);
  const low = items.filter((i) => i.lowStock);
  const totalValue = items.reduce((a, i) => a + i.value, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title="Lager" />

      <StockScanAdjust />


      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Produkter" value={String(items.length)} />
        <StatTile label="Må bestilles" value={String(low.length)} sub="på/under terskel" />
        <StatTile label="Lagerverdi" value={nok(totalValue)} sub="beholdning × pris" />
      </div>

      {/* Registrer varemottak / justering */}
      <details className="border border-line bg-surface">
        <summary className="cursor-pointer px-6 py-4 font-display text-lg font-bold">
          Registrer varemottak / justering
        </summary>
        <StockAdjustForm
          items={items.map((i) => ({ id: i.id, name: i.name, stock: i.stock }))}
        />
      </details>

      {/* Må bestilles */}
      {low.length > 0 && (
        <div className="border border-accent-soft/40 bg-accent-soft/5">
          <div className="border-b border-accent-soft/30 px-6 py-4">
            <h2 className="font-display text-lg font-bold">Må bestilles ({low.length})</h2>
          </div>
          <ul className="divide-y divide-line">
            {low.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-6 py-3 text-sm">
                <span className="text-fg">{i.name}</span>
                <span className="text-muted">
                  <span className="font-semibold text-accent-soft">{i.stock}</span> på lager · terskel {i.threshold}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full beholdning */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Beholdning</h2>
        </div>
        <Table>
          <THead>
            <Tr head>
              <Th>Produkt</Th>
              <Th>På lager</Th>
              <Th>Sett til</Th>
              <Th>Terskel</Th>
              <Th align="right">Verdi</Th>
            </Tr>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TableEmpty colSpan={5}>Ingen produkter registrert.</TableEmpty>
            ) : (
              items.map((i) => (
                <Tr key={i.id} className="align-middle">
                  <Td>
                    <span className={i.active ? "text-fg" : "text-muted line-through"}>{i.name}</span>
                    {i.lowStock && (
                      <Badge tone="warning" className="ml-2">
                        lavt
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <QuickStock id={i.id} stock={i.stock} />
                  </Td>
                  <Td>
                    <SetStockForm id={i.id} stock={i.stock} />
                  </Td>
                  <Td>
                    <ThresholdForm id={i.id} threshold={i.threshold} />
                  </Td>
                  <Td align="right" nums>{nok(i.value)}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {/* Bevegelseslogg */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Bevegelseslogg</h2>
        </div>
        <Table>
          <THead>
            <Tr head>
              <Th>Tid</Th>
              <Th>Produkt</Th>
              <Th>Endring</Th>
              <Th>Årsak</Th>
              <Th>Nytt lager</Th>
              <Th>Notat</Th>
            </Tr>
          </THead>
          <TBody>
            {movements.length === 0 ? (
              <TableEmpty colSpan={6}>Ingen registrerte bevegelser enda.</TableEmpty>
            ) : (
              movements.map((m) => (
                <Tr key={m.id}>
                  <Td muted className="whitespace-nowrap">{fmt(m.at)}</Td>
                  <Td>{m.productName}</Td>
                  <Td nums className={"font-semibold " + (m.delta < 0 ? "text-danger" : "text-accent-soft")}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </Td>
                  <Td muted>{REASON_LABEL[m.reason] ?? m.reason}</Td>
                  <Td nums>{m.newStock ?? "—"}</Td>
                  <Td muted>{m.note ?? ""}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
