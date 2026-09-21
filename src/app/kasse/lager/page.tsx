import { requireRole } from "@/lib/auth";
import { StockScanAdjust } from "@/components/admin/StockScanAdjust";

export const dynamic = "force-dynamic";

export default async function KasseLager() {
  await requireRole(["shop", "admin"]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Lager</h1>
        <p className="mt-1 text-sm text-muted">
          Skann en vare og registrer antall inn (varemottak) eller ut. Bruk
          kameraet eller en strekkodeleser.
        </p>
      </div>
      <StockScanAdjust />
    </main>
  );
}
