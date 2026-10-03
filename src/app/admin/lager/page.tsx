import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Field } from "@/components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { getInventory, getStockMovements } from "@/lib/inventory-queries";
import { StockScanAdjust } from "@/components/admin/StockScanAdjust";
import { adjustStockAction, setStockAction, setThresholdAction } from "./actions";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";

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

/** Liten hurtigknapp: +/- delta i ett klikk. */
function Quick({ id, delta, label }: { id: string; delta: number; label: string }) {
  return (
    <form action={adjustStockAction} className="inline">
      <input type="hidden" name="productId" value={id} />
      <input type="hidden" name="delta" value={delta} />
      <input type="hidden" name="reason" value="justering" />
      <button
        type="submit"
        className="h-7 w-8 border border-line-2 text-sm text-fg transition-colors hover:bg-surface-2"
        title={`${delta > 0 ? "Øk" : "Reduser"} med ${Math.abs(delta)}`}
      >
        {label}
      </button>
    </form>
  );
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
        <form action={adjustStockAction} className="grid gap-3 border-t border-line p-6 sm:grid-cols-2">
          <Field label="Produkt">
            <Select name="productId" required>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} (på lager: {i.stock})</option>
              ))}
            </Select>
          </Field>
          <Field label="Antall (bruk minus for uttak)">
            <Input name="delta" type="number" defaultValue={1} required />
          </Field>
          <Field label="Årsak">
            <Select name="reason">
              <option value="varemottak">Varemottak</option>
              <option value="svinn">Svinn</option>
              <option value="telling">Opptelling</option>
              <option value="justering">Justering</option>
            </Select>
          </Field>
          <Field label="Notat (valgfritt)">
            <Input name="note" type="text" />
          </Field>
          <Button type="submit" className="px-4 py-2 text-sm sm:col-span-2">
            Registrer
          </Button>
        </form>
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
                    <div className="flex items-center gap-1.5">
                      <Quick id={i.id} delta={-1} label="−" />
                      <span className="w-10 text-center font-display text-base font-bold tabular-nums">{i.stock}</span>
                      <Quick id={i.id} delta={1} label="+" />
                      <Quick id={i.id} delta={10} label="+10" />
                    </div>
                  </Td>
                  <Td>
                    <form action={setStockAction} className="flex items-center gap-1">
                      <input type="hidden" name="productId" value={i.id} />
                      <input name="target" type="number" min={0} defaultValue={i.stock} className="w-16 border border-line-2 bg-canvas px-2 py-1 text-sm text-fg" />
                      <button type="submit" className="border border-line-2 px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">OK</button>
                    </form>
                  </Td>
                  <Td>
                    <form action={setThresholdAction} className="flex items-center gap-1">
                      <input type="hidden" name="productId" value={i.id} />
                      <input name="threshold" type="number" min={0} defaultValue={i.threshold} className="w-14 border border-line-2 bg-canvas px-2 py-1 text-sm text-fg" />
                      <button type="submit" className="border border-line-2 px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">Lagre</button>
                    </form>
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
