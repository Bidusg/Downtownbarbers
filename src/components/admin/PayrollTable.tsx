import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import type { PayrollRow } from "@/lib/ops-queries";

/* =====================================================================
 * Lønnstabellen per barber for en måned – brukt både av admin (Lønn) og
 * revisor (Lønnsoversikt), så begge ser nøyaktig de samme tallene:
 * omsetning, over terskel (ja/nei), provisjon, grunnlønn, trekk for
 * fravær/del av måned og total lønn.
 * ===================================================================== */

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

export function PayrollTable({
  rows,
  ratePct,
  thresholdNok,
}: {
  rows: PayrollRow[];
  ratePct: number;
  thresholdNok: number;
}) {
  const trekk = (r: PayrollRow) => (r.deductionNok ?? 0) + (r.employmentDeductionNok ?? 0);
  const totalPay = rows.reduce((s, r) => s + r.totalNok, 0);
  const totalNet = rows.reduce((s, r) => s + r.netNok, 0);
  const over = rows.filter((r) => r.commissionBaseNok > 0).length;

  return (
      <Card padded={false}>
        <Table className="min-w-[720px]">
          <THead>
            <Tr head className="bg-surface-2 tracking-wide uppercase">
              <Th>Barber</Th>
              <Th align="right">Omsetning inkl.</Th>
              <Th align="right">Eks. mva</Th>
              <Th align="right">Over terskel</Th>
              <Th align="right">Provisjon {ratePct} %</Th>
              <Th align="right">Grunnlønn</Th>
              <Th align="right">Trekk</Th>
              <Th align="right">Total lønn</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={8}>
                Ingen aktive barbere eller ingen salg registrert for perioden.
              </TableEmpty>
            )}
            {rows.map((r) => (
              <Tr key={r.staffId}>
                <Td className="font-medium text-fg">
                  {r.name}
                  <span className="ml-2 text-xs text-muted">{r.title ?? "Barber"}</span>
                </Td>
                <Td align="right" muted nums>
                  {kr(r.grossNok)}
                  {(r.importedNok ?? 0) > 0 && (
                    <span
                      className="ml-1.5 rounded-full border border-accent-soft/40 px-1.5 py-0.5 text-[10px] text-accent-soft"
                      title="Omsetningen er importert fra det gamle kassesystemet"
                    >
                      importert
                    </span>
                  )}
                </Td>
                <Td align="right" muted nums>{kr(r.netNok)}</Td>
                <Td align="right">
                  {r.commissionBaseNok > 0 ? (
                    <span
                      className="rounded-full bg-accent-soft/15 px-2 py-0.5 text-xs font-semibold text-accent-soft"
                      title={`${kr(r.commissionBaseNok)} over terskelen på ${kr(thresholdNok)} eks. mva`}
                    >
                      Ja
                    </span>
                  ) : (
                    <span className="text-xs text-muted" title={`Under terskelen på ${kr(thresholdNok)} eks. mva`}>
                      Nei
                    </span>
                  )}
                </Td>
                <Td align="right" nums className="text-accent-soft">{kr(r.commissionNok)}</Td>
                <Td align="right" muted nums>{kr(r.baseNok)}</Td>
                <Td align="right" nums className={trekk(r) > 0 ? "text-danger" : "text-muted"}>
                  {trekk(r) > 0 ? (
                    <span
                      title={[
                        (r.employmentDeductionNok ?? 0) > 0
                          ? `Ansatt ${r.employedDays} av ${r.daysInMonth} dager: − ${kr(r.employmentDeductionNok ?? 0)}`
                          : "",
                        (r.deductionNok ?? 0) > 0
                          ? `Fravær ${String(Math.round((r.absenceDays ?? 0) * 100) / 100).replace(".", ",")} av ${r.workdays} arbeidsdager: − ${kr(r.deductionNok ?? 0)}`
                          : "",
                      ].filter(Boolean).join("\n")}
                    >
                      − {kr(trekk(r))}
                      <span className="block text-[10px]">
                        {(r.employmentDeductionNok ?? 0) > 0 ? `ansatt ${r.employedDays}/${r.daysInMonth} d` : ""}
                        {(r.employmentDeductionNok ?? 0) > 0 && (r.deductionNok ?? 0) > 0 ? " · " : ""}
                        {(r.deductionNok ?? 0) > 0 ? `fravær ${String(Math.round((r.absenceDays ?? 0) * 100) / 100).replace(".", ",")} d` : ""}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
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
                <Td align="right" className="text-xs text-muted">
                  {over} av {rows.length}
                </Td>
                <Td align="right" nums className="text-accent-soft">{kr(rows.reduce((s, r) => s + r.commissionNok, 0))}</Td>
                <Td align="right" muted nums>{kr(rows.reduce((s, r) => s + r.baseNok, 0))}</Td>
                <Td align="right" nums className="text-danger">
                  {rows.some((r) => trekk(r) > 0)
                    ? `− ${kr(rows.reduce((s, r) => s + trekk(r), 0))}`
                    : "—"}
                </Td>
                <Td align="right" nums className="font-display text-fg">{kr(totalPay)}</Td>
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>

  );
}
