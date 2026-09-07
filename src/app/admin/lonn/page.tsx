import { StatTile } from "@/components/ui/StatTile";
import { getPayroll, PAYROLL } from "@/lib/ops-queries";

const kr = (n: number) =>
  Math.round(n).toLocaleString("nb-NO") + " kr";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export default async function AdminLonn({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const now = new Date();
  const sp = await searchParams;
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;

  const rows = await getPayroll(year, month);
  const totalPay = rows.reduce((s, r) => s + r.totalNok, 0);
  const totalNet = rows.reduce((s, r) => s + r.netNok, 0);
  const overThreshold = rows.filter((r) => r.commissionBaseNok > 0).length;
  const years = [year - 1, year, year + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="mb-1 font-display text-2xl font-bold">Lønn</h1>
        <p className="text-sm text-muted">
          Grunnlønn {kr(PAYROLL.BASE_NOK)} + {Math.round(PAYROLL.RATE * 100)} %
          provisjon av omsetning (eks. mva) over {kr(PAYROLL.THRESHOLD_NOK)}.
        </p>
      </div>

      {/* Måneds-velger */}
      <form method="get" className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
        <label className="text-xs text-muted">
          Måned
          <select name="month" defaultValue={month} className={`mt-1 block ${inputCls}`}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          År
          <select name="year" defaultValue={year} className={`mt-1 block ${inputCls}`}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="bg-surface-2 px-4 py-2 text-sm font-semibold text-fg hover:bg-line">
          Vis
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`Total lønn ${MONTHS[month - 1]}`} value={kr(totalPay)} sub={`${rows.length} barbere`} />
        <StatTile label="Omsetning eks. mva" value={kr(totalNet)} sub="hele salongen" />
        <StatTile label="Over terskel" value={`${overThreshold} av ${rows.length}`} sub={`terskel ${kr(PAYROLL.THRESHOLD_NOK)}`} />
      </div>

      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Barber</th>
              <th className="px-4 py-3 text-right">Omsetning inkl.</th>
              <th className="px-4 py-3 text-right">Eks. mva</th>
              <th className="px-4 py-3 text-right">Over terskel</th>
              <th className="px-4 py-3 text-right">Provisjon 40 %</th>
              <th className="px-4 py-3 text-right">Grunnlønn</th>
              <th className="px-4 py-3 text-right">Total lønn</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Ingen aktive barbere eller ingen salg registrert for perioden.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.staffId} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">
                  {r.name}
                  <span className="ml-2 text-xs text-muted">{r.title ?? "Barber"}</span>
                </td>
                <td className="px-4 py-3 text-right text-muted">{kr(r.grossNok)}</td>
                <td className="px-4 py-3 text-right text-muted">{kr(r.netNok)}</td>
                <td className="px-4 py-3 text-right text-muted">{kr(r.commissionBaseNok)}</td>
                <td className="px-4 py-3 text-right text-accent-soft">{kr(r.commissionNok)}</td>
                <td className="px-4 py-3 text-right text-muted">{kr(r.baseNok)}</td>
                <td className="px-4 py-3 text-right font-display font-bold text-fg">{kr(r.totalNok)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-2 bg-surface-2 font-semibold">
                <td className="px-4 py-3 text-fg">Sum</td>
                <td className="px-4 py-3 text-right text-muted">{kr(rows.reduce((s, r) => s + r.grossNok, 0))}</td>
                <td className="px-4 py-3 text-right text-muted">{kr(totalNet)}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right text-accent-soft">{kr(rows.reduce((s, r) => s + r.commissionNok, 0))}</td>
                <td className="px-4 py-3 text-right text-muted">{kr(rows.reduce((s, r) => s + r.baseNok, 0))}</td>
                <td className="px-4 py-3 text-right font-display text-fg">{kr(totalPay)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="border border-line bg-surface p-5 text-sm text-muted">
        <p className="mb-2 font-semibold text-fg">Slik regnes lønnen</p>
        <p className="font-display text-fg">
          lønn = {kr(PAYROLL.BASE_NOK)} + {PAYROLL.RATE.toString().replace(".", ",")} × maks(0, omsetning eks. mva − {kr(PAYROLL.THRESHOLD_NOK)})
        </p>
        <p className="mt-3">
          Omsetningen hentes fra registrert salg i kassen (<code>sales.total_nok</code>)
          per barber for valgt måned. Beløpet antas å være <strong>inkl. mva</strong>,
          og eks. mva regnes som beløp ÷ {(1 + PAYROLL.MVA).toString().replace(".", ",")}{" "}
          ({Math.round(PAYROLL.MVA * 100)} % mva). Stemmer ikke det for din kasse, si
          fra, så justerer jeg satsen ett sted i <code>src/lib/ops-queries.ts</code>.
        </p>
      </div>
    </div>
  );
}
