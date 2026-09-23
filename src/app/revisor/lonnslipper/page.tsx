import { requireRole } from "@/lib/auth";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { PAYROLL } from "@/lib/ops-queries";
import { getPayrollForMonth } from "@/lib/payroll-slips";
import { GeneratePayslipsButton } from "@/components/revisor/GeneratePayslipsButton";

// @react-pdf/renderer kjøres i server-action mot denne siden – krever Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

const inputCls =
  "border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export default async function RevisorLonnslipper({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireRole(["revisor", "admin"]);

  const now = new Date();
  const sp = await searchParams;
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;

  const rows = await getPayrollForMonth(year, month);
  const totalPay = rows.reduce((s, r) => s + r.totalNok, 0);
  const totalGross = rows.reduce((s, r) => s + r.grossNok, 0);
  const monthLabel = MONTHS[month - 1] ?? String(month);
  const years = [year - 1, year, year + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Lønnsslipper"
        description={`Grunnlønn ${kr(PAYROLL.BASE_NOK)} + ${Math.round(
          PAYROLL.RATE * 100,
        )} % provisjon av omsetning (eks. mva) over ${kr(
          PAYROLL.THRESHOLD_NOK,
        )}. Forhåndsvis under, og generer PDF til hver ansatt.`}
      />

      {/* Måneds-velger */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4"
      >
        <label className="text-xs text-muted">
          Måned
          <select
            name="month"
            defaultValue={month}
            className={`mt-1 block ${inputCls}`}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          År
          <select
            name="year"
            defaultValue={year}
            className={`mt-1 block ${inputCls}`}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-surface-2 px-4 py-2 text-sm font-semibold text-fg hover:bg-line"
        >
          Vis
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label={`Sum utbetalt ${monthLabel}`}
          value={kr(totalPay)}
          sub={`${rows.length} ansatte`}
        />
        <StatTile
          label="Omsetning inkl. mva"
          value={kr(totalGross)}
          sub="hele salongen"
        />
        <StatTile
          label="Grunnlønn"
          value={kr(PAYROLL.BASE_NOK)}
          sub="per ansatt"
        />
      </div>

      {/* Forhåndsvisning */}
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Ansatt</th>
              <th className="px-4 py-3 text-right">Grunnlønn</th>
              <th className="px-4 py-3 text-right">Omsetning inkl.</th>
              <th className="px-4 py-3 text-right">Netto eks. mva</th>
              <th className="px-4 py-3 text-right">Prov.grunnlag</th>
              <th className="px-4 py-3 text-right">Provisjon</th>
              <th className="px-4 py-3 text-right">Sum utbetalt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Ingen aktive ansatte funnet for perioden.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.staffId} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">
                  {r.name}
                  <span className="ml-2 text-xs text-muted">
                    {r.title ?? "Barber"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(r.baseNok)}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(r.grossNok)}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(r.netNok)}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(r.commissionBaseNok)}
                </td>
                <td className="px-4 py-3 text-right text-accent-soft">
                  {kr(r.commissionNok)}
                </td>
                <td className="px-4 py-3 text-right font-display font-bold text-fg">
                  {kr(r.totalNok)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-2 bg-surface-2 font-semibold">
                <td className="px-4 py-3 text-fg">Sum</td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(rows.reduce((s, r) => s + r.baseNok, 0))}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(totalGross)}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {kr(rows.reduce((s, r) => s + r.netNok, 0))}
                </td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-right text-accent-soft">
                  {kr(rows.reduce((s, r) => s + r.commissionNok, 0))}
                </td>
                <td className="px-4 py-3 text-right font-display text-fg">
                  {kr(totalPay)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Generer + send */}
      <div className="space-y-4 border border-line bg-surface p-6">
        <div>
          <h2 className="font-display text-lg font-bold">
            Generer lønnsslipper
          </h2>
          <p className="mt-1 text-sm text-muted">
            Lager én PDF per aktiv ansatt for {monthLabel} {year} og legger den i
            ansattens private dokumentmappe. Ansatte uten omsetning får en
            oversikt med kun grunnlønn. Kan kjøres på nytt – eksisterende
            lønnsoversikt for måneden erstattes.
          </p>
        </div>
        <GeneratePayslipsButton
          year={year}
          month={month}
          monthLabel={monthLabel}
          staffCount={rows.length}
        />
      </div>

      <div className="border border-line bg-surface p-5 text-sm text-muted">
        <p className="mb-2 font-semibold text-fg">Slik regnes lønnen</p>
        <p className="font-display text-fg">
          lønn = {kr(PAYROLL.BASE_NOK)} +{" "}
          {PAYROLL.RATE.toString().replace(".", ",")} × maks(0, omsetning eks.
          mva − {kr(PAYROLL.THRESHOLD_NOK)})
        </p>
        <p className="mt-3">
          Bruttosum (inkl. mva) per ansatt hentes via en sikret database-rutine.
          Eks. mva regnes som beløp ÷{" "}
          {(1 + PAYROLL.MVA).toString().replace(".", ",")} ({Math.round(PAYROLL.MVA * 100)} %
          mva). Lønnsoversikten er foreløpig og inkluderer ikke skattetrekk.
        </p>
      </div>
    </div>
  );
}
