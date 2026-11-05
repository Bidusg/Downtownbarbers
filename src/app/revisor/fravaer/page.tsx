import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { getAbsences, getLeaveRequests, getStaffOptions } from "@/lib/ops-queries";
import { getAbsenceDays } from "@/lib/absence-pay";
import { ABSENCE_KINDS } from "@/lib/absence-kinds";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

const no = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
const dec = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Fravær for revisor (kun lesing): alt fravær som overlapper valgt måned,
 * om det trekkes i lønn, trekk-dager per ansatt (samme tall som lønnen
 * bruker) og fri-søknader som ikke er behandlet. Endringer gjøres av admin.
 */
export default async function RevisorFravaer({
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
  const m = Number(sp.month);
  const year = Number(sp.year) || osloY;
  const month = m >= 1 && m <= 12 ? m : osloM;
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;

  const [all, requests, staff, days] = await Promise.all([
    getAbsences(),
    getLeaveRequests(),
    getStaffOptions({ includeInactive: true }),
    getAbsenceDays(year, month),
  ]);
  const inMonth = all
    .filter((a) => a.from_date <= last && a.to_date >= first)
    .sort((a, b) => a.from_date.localeCompare(b.from_date) || a.staffName.localeCompare(b.staffName));
  const pending = requests.filter((r) => r.status === "pending");
  const kind = (k: string) => ABSENCE_KINDS.find((x) => x.value === k);
  const calDays = (from: string, to: string) => {
    const a = from < first ? first : from;
    const b = to > last ? last : to;
    return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
  };
  const perStaff = staff
    .map((s) => ({ ...s, d: days.get(s.id) }))
    .filter((s) => (s.d?.absentDays ?? 0) > 0 || inMonth.some((a) => a.staff_id === s.id));
  const years = [year - 1, year, year + 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Fravær"
        description="Alt registrert fravær for måneden og hva som trekkes i lønn. Kun lesing – admin registrerer og endrer fravær."
      />

      <form method="get" className="flex flex-wrap items-end gap-3 border border-line bg-surface p-4">
        <Field label="Måned">
          <Select name="month" defaultValue={month}>
            {MONTHS.map((x, i) => (
              <option key={x} value={i + 1}>{x}</option>
            ))}
          </Select>
        </Field>
        <Field label="År">
          <Select name="year" defaultValue={year}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="link">Vis</Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label={`Fravær ${MONTHS[month - 1]}`} value={String(inMonth.length)} sub="registreringer i måneden" />
        <StatTile
          label="Trekk-dager"
          value={dec([...days.values()].reduce((s, d) => s + d.absentDays, 0))}
          sub="ulønnet / ugyldig fravær"
        />
        <StatTile label="Ubehandlede søknader" value={String(pending.length)} sub="venter på admin" />
      </div>

      <Card title="Per ansatt – det lønnen bruker" padded={false}>
        <Table className="min-w-[560px]">
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th align="right">Arbeidsdager i måneden</Th>
              <Th align="right">Trekk-dager</Th>
              <Th align="right">Andel</Th>
            </Tr>
          </THead>
          <TBody>
            {perStaff.length === 0 && <TableEmpty colSpan={4}>Ingen fravær i måneden.</TableEmpty>}
            {perStaff.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium text-fg">{s.full_name}</Td>
                <Td align="right" nums muted>{s.d?.workdays ?? "—"}</Td>
                <Td align="right" nums className={(s.d?.absentDays ?? 0) > 0 ? "text-danger" : "text-muted"}>
                  {dec(s.d?.absentDays ?? 0)}
                </Td>
                <Td align="right" nums muted>
                  {s.d && s.d.workdays > 0 ? `${dec((s.d.absentDays / s.d.workdays) * 100)} %` : "—"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card title={`Registrert fravær – ${MONTHS[month - 1]} ${year}`} padded={false}>
        <Table className="min-w-[720px]">
          <THead>
            <Tr head>
              <Th>Ansatt</Th>
              <Th>Type</Th>
              <Th>Fra</Th>
              <Th>Til</Th>
              <Th align="right">Dager i mnd.</Th>
              <Th>Trekkes i lønn</Th>
              <Th>Merknad</Th>
            </Tr>
          </THead>
          <TBody>
            {inMonth.length === 0 && <TableEmpty colSpan={7}>Ingen fravær registrert i måneden.</TableEmpty>}
            {inMonth.map((a) => {
              const k = kind(a.kind);
              return (
                <Tr key={a.id}>
                  <Td className="font-medium text-fg">{a.staffName}</Td>
                  <Td>{k?.label ?? a.kind}</Td>
                  <Td nums muted>{no(a.from_date)}</Td>
                  <Td nums muted>{no(a.to_date)}</Td>
                  <Td align="right" nums muted>{calDays(a.from_date, a.to_date)}</Td>
                  <Td>
                    {k?.deduct ? (
                      <span className="text-xs font-semibold text-danger">Ja</span>
                    ) : (
                      <span className="text-xs text-muted">Nei</span>
                    )}
                  </Td>
                  <Td muted className="text-xs">{a.reason ?? "—"}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {pending.length > 0 && (
        <Card title="Fri-søknader som venter på admin" padded={false}>
          <Table className="min-w-[560px]">
            <THead>
              <Tr head>
                <Th>Ansatt</Th>
                <Th>Type</Th>
                <Th>Fra</Th>
                <Th>Til</Th>
                <Th>Merknad</Th>
              </Tr>
            </THead>
            <TBody>
              {pending.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-fg">{r.staffName}</Td>
                  <Td>{kind(r.kind)?.label ?? r.kind}</Td>
                  <Td nums muted>{no(r.from_date)}</Td>
                  <Td nums muted>{no(r.to_date)}</Td>
                  <Td muted className="text-xs">{r.note ?? "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <p className="text-xs text-muted">
        Trekk-dager er de samme som lønnsberegningen bruker: ulønnet permisjon og ugyldig fravær,
        regnet mot arbeidsdagene i turnusen. Sykdom, ferie og «annet» trekkes ikke.
      </p>
    </div>
  );
}
