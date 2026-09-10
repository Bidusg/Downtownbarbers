import { StaffHoursManager } from "@/components/admin/StaffHoursManager";
import { WeekSchedule } from "@/components/admin/WeekSchedule";
import { getStaffHours, getStaffOptions } from "@/lib/ops-queries";

export const dynamic = "force-dynamic";

// ISO-ukenummer (samme regel som available_slots i databasen).
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default async function AdminTimelister({
  searchParams,
}: {
  searchParams: Promise<{ uke?: string }>;
}) {
  const sp = await searchParams;
  const parity: 1 | 2 = sp.uke === "b" ? 2 : 1;
  const [hours, staff] = await Promise.all([getStaffHours(), getStaffOptions()]);

  const wk = isoWeek(new Date());
  const currentParity = wk % 2 === 0 ? 1 : 2; // partall = A, oddetall = B
  const currentLabel = currentParity === 1 ? "Uke A" : "Uke B";

  const tab = (p: "a" | "b", label: string) => {
    const active = (p === "b" ? 2 : 1) === parity;
    return (
      <a
        href={`/admin/timelister?uke=${p}`}
        className={
          "border-b-2 px-4 py-2 text-sm transition-colors " +
          (active
            ? "border-accent-soft font-semibold text-fg"
            : "border-transparent text-muted hover:text-fg")
        }
      >
        {label}
      </a>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Timelister</h1>
      <p className="mb-6 text-sm text-muted">
        Ukentlig turnus per barber. Ukeplanen styrer også når kunder kan booke den
        enkelte barberen. Du kan sette ulik turnus for <strong>uke A</strong> og{" "}
        <strong>uke B</strong> – tider merket «Hver uke» gjelder begge.
      </p>

      <div className="mb-4 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-1">
          {tab("a", "Uke A")}
          {tab("b", "Uke B")}
        </div>
        <p className="pb-2 text-xs text-muted">
          Denne uken (uke {wk}) er <strong className="text-accent-soft">{currentLabel}</strong>
        </p>
      </div>

      <WeekSchedule hours={hours} staff={staff} parity={parity} />

      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Rediger turnus
      </h2>
      <StaffHoursManager hours={hours} staff={staff} />
    </div>
  );
}
