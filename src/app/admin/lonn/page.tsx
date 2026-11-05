import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Input";
import { getPayroll, PAYROLL } from "@/lib/ops-queries";
import { absenceDeductionStatus } from "@/lib/absence-pay";
import { PayrollTable } from "@/components/admin/PayrollTable";
import { GeneratePayslipsButton } from "@/components/revisor/GeneratePayslipsButton";
import { SalaryReportPicker } from "@/components/admin/SalaryReportPicker";
import { getSalaryReportStaff } from "@/lib/salary/report";

// Lønnsslipp-PDF (@react-pdf) kjøres i server-action fra denne siden – krever Node.
export const runtime = "nodejs";

const kr = (n: number) =>
  Math.round(n).toLocaleString("nb-NO") + " kr";

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

  const [rows, deductionError, reportStaff] = await Promise.all([
    getPayroll(year, month),
    absenceDeductionStatus(year, month),
    getSalaryReportStaff(year, month),
  ]);
  const totalPay = rows.reduce((s, r) => s + r.totalNok, 0);
  const totalNet = rows.reduce((s, r) => s + r.netNok, 0);
  const overThreshold = rows.filter((r) => r.commissionBaseNok > 0).length;
  const years = [year - 1, year, year + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Lønn"
        description={`Grunnlønn (standard ${kr(PAYROLL.BASE_NOK)}, settes per ansatt under Ansatte → Rediger) + ${Math.round(
          PAYROLL.RATE * 100,
        )} % provisjon av omsetning (eks. mva) over ${kr(PAYROLL.THRESHOLD_NOK)}.`}
      />

      {/* Måneds-velger */}
      <form method="get" className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
        <Field label="Måned" className="w-auto">
          <Select name="month" defaultValue={month}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="År" className="w-auto">
          <Select name="year" defaultValue={year}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>
        <button type="submit" className="bg-surface-2 px-4 py-2 text-sm font-semibold text-fg hover:bg-line">
          Vis
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`Total lønn ${MONTHS[month - 1]}`} value={kr(totalPay)} sub={`${rows.length} barbere`} />
        <StatTile label="Omsetning eks. mva" value={kr(totalNet)} sub="hele salongen" />
        <StatTile label="Over terskel" value={`${overThreshold} av ${rows.length}`} sub={`terskel ${kr(PAYROLL.THRESHOLD_NOK)}`} />
      </div>

      <PayrollTable rows={rows} ratePct={Math.round(PAYROLL.RATE * 100)} thresholdNok={PAYROLL.THRESHOLD_NOK} />

      {deductionError && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {deductionError}
        </p>
      )}

      {/* Samlet lønnsrapport (PDF) for valgte ansatte */}
      <Card>
        <SalaryReportPicker
          year={year}
          month={month}
          monthLabel={MONTHS[month - 1]}
          staff={reportStaff}
        />
      </Card>

      {/* Generer + send lønnsoversikter (samme som revisor-siden) */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold">Send ut lønnsslipper</h2>
            <p className="mt-1 text-sm text-muted">
              Lager én PDF per aktiv ansatt for {MONTHS[month - 1]} {year}, legger den i
              ansattens dokumentmappe og sender e-post. Kan kjøres på nytt – forrige
              versjon for måneden erstattes.
            </p>
          </div>
          <GeneratePayslipsButton
            year={year}
            month={month}
            monthLabel={MONTHS[month - 1]}
            staffCount={rows.length}
            recipients={rows.map((r) => ({ name: r.name, totalNok: r.totalNok }))}
          />
        </div>
      </Card>

      <Card className="text-sm text-muted">
        <p className="mb-2 font-semibold text-fg">Slik regnes lønnen</p>
        <p className="font-display text-fg">
          lønn = grunnlønn − trekk + {PAYROLL.RATE.toString().replace(".", ",")} × maks(0, omsetning eks. mva − {kr(PAYROLL.THRESHOLD_NOK)})
        </p>
        <p className="mt-3">
          Trekk: (1) ikke ansatt hele måneden (startdato/sluttdato under Ansatte) – grunnlønn ×
          dager ansatt ÷ dager i måneden; (2) ulønnet permisjon og ugyldig fravær (Fravær) –
          grunnlønn ÷ arbeidsdager i måneden × fraværsdager. Arbeidsdager = dagene i turnusen
          (uten turnus: man–fre). Sykdom, ferie og «annet» trekkes ikke.
        </p>
        <p className="mt-3">
          Omsetningen hentes fra registrert salg i kassen per barber for valgt
          måned. Beløpet antas å være <strong>inkl. mva</strong>, og eks. mva
          regnes som beløp ÷ {(1 + PAYROLL.MVA).toString().replace(".", ",")}{" "}
          ({Math.round(PAYROLL.MVA * 100)} % mva).
        </p>
      </Card>
    </div>
  );
}
