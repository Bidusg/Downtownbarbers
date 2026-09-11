import { StatTile } from "@/components/ui/StatTile";
import { getInventory, getStockMovements } from "@/lib/inventory-queries";
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
      <h1 className="font-display text-2xl font-bold">Lager</h1>

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
          <label className="flex flex-col gap-1 text-xs text-muted">
            Produkt
            <select name="productId" required className="border border-line-2 bg-canvas px-3 py-2 text-sm text-fg">
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name} (på lager: {i.stock})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Antall (bruk minus for uttak)
            <input name="delta" type="number" defaultValue={1} required className="border border-line-2 bg-canvas px-3 py-2 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Årsak
            <select name="reason" className="border border-line-2 bg-canvas px-3 py-2 text-sm text-fg">
              <option value="varemottak">Varemottak</option>
              <option value="svinn">Svinn</option>
              <option value="telling">Opptelling</option>
              <option value="justering">Justering</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Notat (valgfritt)
            <input name="note" type="text" className="border border-line-2 bg-canvas px-3 py-2 text-sm text-fg" />
          </label>
          <button type="submit" className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 sm:col-span-2">
            Registrer
          </button>
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
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Beholdning</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen produkter registrert.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Produkt</th>
                  <th className="px-4 py-3 font-medium">På lager</th>
                  <th className="px-4 py-3 font-medium">Sett til</th>
                  <th className="px-4 py-3 font-medium">Terskel</th>
                  <th className="px-4 py-3 text-right font-medium">Verdi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0 align-middle">
                    <td className="px-6 py-3">
                      <span className={i.active ? "text-fg" : "text-muted line-through"}>{i.name}</span>
                      {i.lowStock && (
                        <span className="ml-2 bg-accent-soft/15 px-2 py-0.5 text-[10px] font-semibold text-accent-soft">
                          lavt
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Quick id={i.id} delta={-1} label="−" />
                        <span className="w-10 text-center font-display text-base font-bold tabular-nums">{i.stock}</span>
                        <Quick id={i.id} delta={1} label="+" />
                        <Quick id={i.id} delta={10} label="+10" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <form action={setStockAction} className="flex items-center gap-1">
                        <input type="hidden" name="productId" value={i.id} />
                        <input name="target" type="number" min={0} defaultValue={i.stock} className="w-16 border border-line-2 bg-canvas px-2 py-1 text-sm text-fg" />
                        <button type="submit" className="border border-line-2 px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">OK</button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={setThresholdAction} className="flex items-center gap-1">
                        <input type="hidden" name="productId" value={i.id} />
                        <input name="threshold" type="number" min={0} defaultValue={i.threshold} className="w-14 border border-line-2 bg-canvas px-2 py-1 text-sm text-fg" />
                        <button type="submit" className="border border-line-2 px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">Lagre</button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{nok(i.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bevegelseslogg */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Bevegelseslogg</h2>
        </div>
        {movements.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen registrerte bevegelser enda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Tid</th>
                  <th className="px-4 py-3 font-medium">Produkt</th>
                  <th className="px-4 py-3 font-medium">Endring</th>
                  <th className="px-4 py-3 font-medium">Årsak</th>
                  <th className="px-4 py-3 font-medium">Nytt lager</th>
                  <th className="px-4 py-3 font-medium">Notat</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 whitespace-nowrap text-muted">{fmt(m.at)}</td>
                    <td className="px-4 py-3">{m.productName}</td>
                    <td className={"px-4 py-3 font-semibold tabular-nums " + (m.delta < 0 ? "text-danger" : "text-accent-soft")}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </td>
                    <td className="px-4 py-3 text-muted">{REASON_LABEL[m.reason] ?? m.reason}</td>
                    <td className="px-4 py-3 tabular-nums">{m.newStock ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
