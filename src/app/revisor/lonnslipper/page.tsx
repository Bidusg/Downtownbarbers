import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PAYROLL } from "@/lib/ops-queries";
import { getPayrollForMonth, payrollGrossStatus } from "@/lib/payroll-slips";
import { GeneratePayslipsButton } from "@/components/revisor/GeneratePayslipsButton";
import { PayrollTable } from "@/components/admin/PayrollTable";
import { SalaryReportPicker } from "@/components/admin/SalaryReportPicker";
import { getSalaryReportStaff } from "@/lib/salary/report";
import { absenceDeductionStatus } from "@/lib/absence-pay";
import { formatKr as kr } from "@/lib/format";

// @react-pdf/renderer kjøres i server-action mot denne siden – krever Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Standard: inneværende måned i Oslo (serveren kjører i UTC).
  const [osloY, osloM] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" })
    .split("-")
    .map(Number);
  const sp = await searchParams;
  const spMonth = Number(sp.month);
  const year = Number(sp.year) || osloY;
  const month = spMonth >= 1 && spMonth <= 12 ? spMonth : osloM;

  const [rows, deductionError, reportStaff] = await Promise.all([
    getPayrollForMonth(year, month),
    Promise.all([absenceDeductionStatus(year, month), payrollGrossStatus(year, month)]).then(
      ([a, g]) => g ?? a,
    ),
    getSalaryReportStaff(year, month),
  ]);
  // Finnes det lønnsoversikter for måneden fra før? Da er e-post av som standard.
  let hasExisting = false;
  try {
    const sb = await createClient();
    const { count } = await sb
      .from("staff_documents")
      .select("id", { count: "exact", head: true })
      .eq("category", "lonnslipp")
      .eq("period", `${year}-${String(month).padStart(2, "0")}`);
    hasExisting = (count ?? 0) > 0;
  } catch {
    hasExisting = false;
  }
  const totalPay = rows.reduce((s, r) => s + r.totalNok, 0);
  const totalGross = rows.reduce((s, r) => s + r.grossNok, 0);
  const monthLabel = MONTHS[month - 1] ?? String(month);
  const years = [year - 1, year, year + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Lønnsoversikt"
        description={`Grunnlønn (standard ${kr(PAYROLL.BASE_NOK)}, kan være satt per ansatt) + ${Math.round(
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
        <Field label="Måned">
          <Select name="month" defaultValue={month}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="År">
          <Select name="year" defaultValue={year}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="link">
          Vis
        </Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Sum utbetalt"
          value={kr(totalPay)}
          sub={`${rows.length} ${rows.length === 1 ? "ansatt" : "ansatte"} · ${monthLabel} ${year}`}
        />
        <StatTile
          label="Omsetning inkl. mva"
          value={kr(totalGross)}
          sub={`hele salongen · ${monthLabel} ${year}`}
        />
        <StatTile
          label="Grunnlønn"
          value={kr(PAYROLL.BASE_NOK)}
          sub="per ansatt"
        />
      </div>

      {/* Samme lønnstabell som admin ser (inkl. trekk for fravær) */}
      <PayrollTable rows={rows} ratePct={Math.round(PAYROLL.RATE * 100)} thresholdNok={PAYROLL.THRESHOLD_NOK} />

      {deductionError && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {deductionError}
        </p>
      )}

      {/* Samlet lønnsrapport (PDF) for valgte ansatte */}
      <Card>
        <SalaryReportPicker year={year} month={month} monthLabel={monthLabel} staff={reportStaff} />
      </Card>

      {/* Generer + send */}
      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold">
              Generer lønnsoversikter
            </h2>
            <p className="mt-1 text-sm text-muted">
              Lager én PDF per aktiv ansatt for {monthLabel} {year} og legger den
              i ansattens private dokumentmappe. Ansatte uten omsetning får en
              oversikt med kun grunnlønn. Kan kjøres på nytt – eksisterende
              lønnsoversikt for måneden erstattes.
            </p>
          </div>
          <GeneratePayslipsButton
            year={year}
            month={month}
            monthLabel={monthLabel}
            staffCount={rows.length}
            alreadyGenerated={hasExisting}
            recipients={rows.map((r) => ({ name: r.name, totalNok: r.totalNok }))}
          />
        </div>
      </Card>

      <Card className="text-sm text-muted">
        <p className="mb-2 font-semibold text-fg">Slik regnes lønnen</p>
        <p className="font-display text-fg">
          lønn = grunnlønn +{" "}
          {PAYROLL.RATE.toString().replace(".", ",")} × maks(0, omsetning eks.
          mva − {kr(PAYROLL.THRESHOLD_NOK)})
        </p>
        <p className="mt-3">
          Bruttosum (inkl. mva) per ansatt hentes via en sikret systemrutine.
          Eks. mva regnes som beløp ÷{" "}
          {(1 + PAYROLL.MVA).toString().replace(".", ",")} ({Math.round(PAYROLL.MVA * 100)} %
          mva). Lønnsoversikten er foreløpig og inkluderer ikke skattetrekk.
        </p>
      </Card>
    </div>
  );
}
