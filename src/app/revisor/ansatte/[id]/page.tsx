import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { getStaffOptions } from "@/lib/ops-queries";
import {
  getSalarySettings,
  getSalaryPeriod,
  getSalaryManualLines,
  getSalaryContext,
} from "@/lib/salary/queries";
import { SalaryEditor } from "@/components/revisor/SalaryEditor";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

export default async function RevisorAnsattLonn({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireRole(["revisor", "admin"]);

  const { id } = await params;
  const [osloY, osloM] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" })
    .split("-")
    .map(Number);
  const sp = await searchParams;
  const spMonth = Number(sp.month);
  const year = Number(sp.year) || osloY;
  const month = spMonth >= 1 && spMonth <= 12 ? spMonth : osloM;

  const [staffList, settings, period, manualLines, context] = await Promise.all([
    getStaffOptions(),
    getSalarySettings(id),
    getSalaryPeriod(id, year, month),
    getSalaryManualLines(id, year, month),
    getSalaryContext(id, year, month),
  ]);

  const staff = staffList.find((s) => s.id === id);
  const monthLabel = MONTHS[month - 1] ?? String(month);

  // Periode-navigasjon (← →)
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const hrefFor = (y: number, m: number) => `/revisor/ansatte/${id}?year=${y}&month=${m}`;

  if (!staff || !context) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader title="Lønn per ansatt" description="Fant ikke ansatt." />
        <Button href="/revisor/ansatte" variant="link">← Tilbake til oversikt</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <Button href={`/revisor/ansatte?year=${year}&month=${month}`} variant="link">
          ← Alle ansatte
        </Button>
      </div>

      <PageHeader
        title={staff.full_name}
        description={`${staff.title ?? "Barber"} · lønnsside med live beregning. Innstillingene er forhåndsutfylt med grunninnstillinger og kan justeres per ansatt.`}
        actions={
          <div className="flex items-center gap-2">
            <Button href={hrefFor(prev.y, prev.m)} variant="subtle" className="px-3 py-1.5 text-sm" aria-label="Forrige måned">←</Button>
            <span className="min-w-[8rem] text-center text-sm font-semibold text-fg">
              {monthLabel} {year}
            </span>
            <Button href={hrefFor(next.y, next.m)} variant="subtle" className="px-3 py-1.5 text-sm" aria-label="Neste måned">→</Button>
          </div>
        }
      />

      <SalaryEditor
        staffId={id}
        year={year}
        month={month}
        monthLabel={monthLabel}
        initialSettings={settings}
        initialPeriod={period}
        manualLines={manualLines}
        context={context}
      />
    </div>
  );
}
