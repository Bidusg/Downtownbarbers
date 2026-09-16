import { StaffHoursManager } from "@/components/admin/StaffHoursManager";
import { StaffExceptionsManager } from "@/components/admin/StaffExceptionsManager";
import { WeekSchedule } from "@/components/admin/WeekSchedule";
import {
  getStaffHours,
  getStaffOptions,
  getTurnusAnchor,
  getStaffExceptions,
} from "@/lib/ops-queries";
import { setTurnusAnchor } from "@/app/admin/timelister/actions";

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
  const [hours, staff, anchor, exceptions] = await Promise.all([
    getStaffHours(),
    getStaffOptions(),
    getTurnusAnchor(),
    getStaffExceptions(),
  ]);

  const wk = isoWeek(new Date());
  const evenIsA = anchor.aIsEven;
  const currentParity: 1 | 2 = (wk % 2 === 0) === evenIsA ? 1 : 2;
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

      <form
        action={setTurnusAnchor}
        className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted"
      >
        <span>A/B-anker:</span>
        <select
          name="a_is_even"
          defaultValue={evenIsA ? "even" : "odd"}
          className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus:border-accent-soft focus:outline-none"
        >
          <option value="even">Partallsuker (uke 2, 4, 6 …) er Uke A</option>
          <option value="odd">Oddetallsuker (uke 1, 3, 5 …) er Uke A</option>
        </select>
        <button
          type="submit"
          className="rounded-md border border-line-2 px-3 py-1 font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg"
        >
          Lagre anker
        </button>
        <span className="text-[11px]">
          Bestemmer hvilken kalenderuke som er A vs B — brukes av både booking og timelister.
        </span>
      </form>

      <WeekSchedule hours={hours} staff={staff} parity={parity} />

      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Rediger turnus
      </h2>
      <StaffHoursManager hours={hours} staff={staff} />

      <div className="mt-10 mb-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Avvik &amp; fravær
        </h2>
        <p className="mt-1 text-sm text-muted">
          Overstyr turnusen for enkeltdatoer: fri hele eller deler av dagen, eller
          en ekstravakt. Booking og ledige tider oppdateres automatisk. Ferie og
          annet fravær over flere dager registreres under{" "}
          <a href="/admin/fravaer" className="text-accent-soft hover:underline">
            Fravær
          </a>{" "}
          – det blokkerer nå også booking.
        </p>
      </div>
      <StaffExceptionsManager exceptions={exceptions} staff={staff} />
    </div>
  );
}
