import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getStaffOptions } from "@/lib/ops-queries";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export default async function RevisorAnsatte({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireRole(["revisor", "admin"]);

  const [osloY, osloM] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" })
    .split("-")
    .map(Number);
  const sp = await searchParams;
  const spMonth = Number(sp.month);
  const year = Number(sp.year) || osloY;
  const month = spMonth >= 1 && spMonth <= 12 ? spMonth : osloM;

  const staff = await getStaffOptions();
  const years = [year - 1, year, year + 1];
  const q = `?year=${year}&month=${month}`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Lønn per ansatt"
        description="Velg en ansatt for å se og justere lønnsinnstillinger, tillegg, provisjon og trekk – med live beregning av lønna for valgt måned."
      />

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
        <Button type="submit" variant="link">Vis</Button>
      </form>

      <Card padded={false}>
        <Table className="min-w-[480px]">
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th>Stilling</Th>
              <Th align="right">Lønnsside</Th>
            </Tr>
          </THead>
          <TBody>
            {staff.length === 0 && (
              <TableEmpty colSpan={3}>Ingen aktive ansatte funnet.</TableEmpty>
            )}
            {staff.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium text-fg">{s.full_name}</Td>
                <Td muted>{s.title ?? "Barber"}</Td>
                <Td align="right">
                  <Button href={`/revisor/ansatte/${s.id}${q}`} variant="link">
                    Åpne lønnsside →
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <p className="text-sm text-muted">
        Grunninnstillingene speiler dagens bekreftede lønnsmodell (grunnlønn +
        40 % provisjon av omsetning eks. mva over 72 000 kr). Endringer per ansatt
        lagres når du trykker «Lagre forandringer» på den enkelte lønnssiden.
      </p>
    </div>
  );
}
