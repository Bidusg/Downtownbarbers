import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Field, Select } from "@/components/ui/Input";
import { getPayroll, PAYROLL } from "@/lib/ops-queries";

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

  const rows = await getPayroll(year, month);
  const totalPay = rows.reduce((s, r) => s + r.totalNok, 0);
  const totalNet = rows.reduce((s, r) => s + r.netNok, 0);
  const overThreshold = rows.filter((r) => r.commissionBaseNok > 0).length;
  const years = [year - 1, year, year + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Lønn"
        description={`Grunnlønn ${kr(PAYROLL.BASE_NOK)} + ${Math.round(
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

      <Card padded={false}>
        <Table className="min-w-[720px]">
          <THead>
            <Tr head className="bg-surface-2 tracking-wide uppercase">
              <Th>Barber</Th>
              <Th align="right">Omsetning inkl.</Th>
              <Th align="right">Eks. mva</Th>
              <Th align="right">Over terskel</Th>
              <Th align="right">Provisjon 40 %</Th>
              <Th align="right">Grunnlønn</Th>
              <Th align="right">Total lønn</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={7}>
                Ingen aktive barbere eller ingen salg registrert for perioden.
              </TableEmpty>
            )}
            {rows.map((r) => (
              <Tr key={r.staffId}>
                <Td className="font-medium text-fg">
                  {r.name}
                  <span className="ml-2 text-xs text-muted">{r.title ?? "Barber"}</span>
                </Td>
                <Td align="right" muted nums>{kr(r.grossNok)}</Td>
                <Td align="right" muted nums>{kr(r.netNok)}</Td>
                <Td align="right" muted nums>{kr(r.commissionBaseNok)}</Td>
                <Td align="right" nums className="text-accent-soft">{kr(r.commissionNok)}</Td>
                <Td align="right" muted nums>{kr(r.baseNok)}</Td>
                <Td align="right" nums className="font-display font-bold text-fg">{kr(r.totalNok)}</Td>
              </Tr>
            ))}
          </TBody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-2 bg-surface-2 font-semibold">
                <Td className="text-fg">Sum</Td>
                <Td align="right" muted nums>{kr(rows.reduce((s, r) => s + r.grossNok, 0))}</Td>
                <Td align="right" muted nums>{kr(totalNet)}</Td>
                <Td></Td>
                <Td align="right" nums className="text-accent-soft">{kr(rows.reduce((s, r) => s + r.commissionNok, 0))}</Td>
                <Td align="right" muted nums>{kr(rows.reduce((s, r) => s + r.baseNok, 0))}</Td>
                <Td align="right" nums className="font-display text-fg">{kr(totalPay)}</Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>

      <Card className="text-sm text-muted">
        <p className="mb-2 font-semibold text-fg">Slik regnes lønnen</p>
        <p className="font-display text-fg">
          lønn = {kr(PAYROLL.BASE_NOK)} + {PAYROLL.RATE.toString().replace(".", ",")} × maks(0, omsetning eks. mva − {kr(PAYROLL.THRESHOLD_NOK)})
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
