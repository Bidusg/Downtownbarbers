import { ProgressBar } from "@/components/ui/ProgressBar";
import { todayShop } from "@/lib/data/mock";
import { requireRole } from "@/lib/auth";

export default async function KasseDashboard() {
  await requireRole(["shop", "admin"]);
  const pct = Math.round(
    (todayShop.customersServed / todayShop.customersTarget) * 100,
  );

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Downtown Barbers
          </p>
          <p className="font-display text-lg font-bold">Kasse</p>
        </div>
        <span className="rounded-full bg-accent-soft/15 px-3 py-1 text-xs font-semibold text-accent-soft">
          Shop
        </span>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 p-6">
        {/* Dagens fremdrift – INGEN kroner, kun kundeantall */}
        <section className="border border-line bg-surface p-8">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Dagens fremdrift
          </p>
          <div className="mt-4 mb-3 flex items-end justify-between">
            <span className="font-display text-6xl font-bold text-fg">{pct} %</span>
            <span className="pb-2 text-lg text-muted">
              {todayShop.customersServed} av {todayShop.customersTarget} kunder
            </span>
          </div>
          <ProgressBar value={pct} />
          <p className="mt-4 text-sm text-muted">
            Bra jobba – {todayShop.customersTarget - todayShop.customersServed} kunder igjen til dagens mål.
          </p>
        </section>

        {/* Neste kunder */}
        <section className="border border-line bg-surface p-6">
          <h2 className="mb-4 font-display text-lg font-bold">Neste inn</h2>
          <ul className="divide-y divide-line">
            {todayShop.nextUp.map((b, i) => (
              <li key={i} className="flex items-center gap-4 py-3">
                <span className="font-display text-sm font-bold text-accent-soft">
                  {b.time}
                </span>
                <span className="flex-1 text-sm text-fg">{b.customer}</span>
                <span className="text-sm text-muted">{b.service}</span>
                <span className="text-xs text-muted">{b.barber}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-xs text-muted">
          Shop-kontoen ser aldri omsetning, budsjett eller lønnsomhet.
        </p>
      </main>
    </div>
  );
}
