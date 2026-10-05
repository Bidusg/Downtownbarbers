import { requireRole } from "@/lib/auth";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PAYROLL } from "@/lib/ops-queries";
import { getPayrollForMonth } from "@/lib/payroll-slips";
import { GeneratePayslipsButton } from "@/components/revisor/GeneratePayslipsButton";

// @react-pdf/renderer kjøres i server-action mot denne siden – krever Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

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
        title="Lønnsoversikt (foreløpig)"
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
        <Button type="submit" variant="subtle" className="px-4 py-2 text-sm">
          Vis
        </Button>
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
      <Card padded={false}>
        <Table className="min-w-[820px]">
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th align="right">Grunnlønn</Th>
              <Th align="right">Omsetning inkl.</Th>
              <Th align="right">Netto eks. mva</Th>
              <Th align="right">Prov.grunnlag</Th>
              <Th align="right">Provisjon</Th>
              <Th align="right">Sum utbetalt</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={7}>
                Ingen aktive ansatte funnet for perioden.
              </TableEmpty>
            )}
            {rows.map((r) => (
              <Tr key={r.staffId}>
                <Td className="font-medium text-fg">
                  {r.name}
                  <span className="ml-2 text-xs text-muted">
                    {r.title ?? "Barber"}
                  </span>
                </Td>
                <Td align="right" nums muted>
                  {kr(r.baseNok)}
                </Td>
                <Td align="right" nums muted>
                  {kr(r.grossNok)}
                </Td>
                <Td align="right" nums muted>
                  {kr(r.netNok)}
                </Td>
                <Td align="right" nums muted>
                  {kr(r.commissionBaseNok)}
                </Td>
                <Td align="right" nums className="text-accent-soft">
                  {kr(r.commissionNok)}
                </Td>
                <Td align="right" nums className="font-display font-bold text-fg">
                  {kr(r.totalNok)}
                </Td>
              </Tr>
            ))}
          </TBody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-2 bg-surface-2 font-semibold">
                <Td className="text-fg">Sum</Td>
                <Td align="right" nums muted>
                  {kr(rows.reduce((s, r) => s + r.baseNok, 0))}
                </Td>
                <Td align="right" nums muted>
                  {kr(totalGross)}
                </Td>
                <Td align="right" nums muted>
                  {kr(rows.reduce((s, r) => s + r.netNok, 0))}
                </Td>
                <Td></Td>
                <Td align="right" nums className="text-accent-soft">
                  {kr(rows.reduce((s, r) => s + r.commissionNok, 0))}
                </Td>
                <Td align="right" nums className="font-display text-fg">
                  {kr(totalPay)}
                </Td>
              </tr>
            </tfoot>
          )}
        </Table>
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
