import { StaffHoursManager } from "@/components/admin/StaffHoursManager";
import { StaffExceptionsManager } from "@/components/admin/StaffExceptionsManager";
import { BulkTurnusForm } from "@/components/admin/BulkTurnusForm";
import { BookingBlocksManager } from "@/components/admin/BookingBlocksManager";
import { RotationControl } from "@/components/admin/RotationControl";
import { WeekSchedule } from "@/components/admin/WeekSchedule";
import {
  getStaffHours,
  getStaffOptions,
  getTurnusRotation,
  getStaffExceptions,
  getBookingBlocks,
} from "@/lib/ops-queries";
import { parityLabel, parityOptions } from "@/lib/turnus";

export const dynamic = "force-dynamic";

export default async function AdminTimelister({
  searchParams,
}: {
  searchParams: Promise<{ uke?: string }>;
}) {
  const sp = await searchParams;
  const [hours, staff, rotation, exceptions, blocks] = await Promise.all([
    getStaffHours(),
    getStaffOptions(),
    getTurnusRotation(),
    getStaffExceptions(),
    getBookingBlocks(),
  ]);

  const weeks = rotation.weeks;
  const options = parityOptions(weeks); // [1..weeks]
  // Valgt uke fra ?uke=N (default: uken som gjelder nå).
  const req = Number(sp.uke);
  const selected =
    Number.isInteger(req) && req >= 1 && req <= weeks ? req : rotation.currentIndex;

  const tab = (idx: number) => {
    const active = idx === selected;
    return (
      <a
        key={idx}
        href={`/admin/timelister?uke=${idx}`}
        className={
          "border-b-2 px-4 py-2 text-sm transition-colors " +
          (active
            ? "border-accent-soft font-semibold text-fg"
            : "border-transparent text-muted hover:text-fg")
        }
      >
        {parityLabel(idx)}
      </a>
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 font-display text-2xl font-bold">Timelister</h1>
      <p className="mb-6 text-sm text-muted">
        Ukentlig turnus per barber. Ukeplanen styrer også når kunder kan booke den
        enkelte barberen. Med rotasjon kan du sette ulik turnus for hver uke i
        mønsteret – tider merket «Hver uke» gjelder alle.
      </p>

      <RotationControl weeks={weeks} />

      {weeks > 1 && (
        <div className="mb-4 flex items-center justify-between border-b border-line">
          <div className="flex flex-wrap items-center gap-1">
            {options.map((i) => tab(i))}
          </div>
          <p className="pb-2 text-xs text-muted">
            Denne uken er{" "}
            <strong className="text-accent-soft">
              {parityLabel(rotation.currentIndex)}
            </strong>
          </p>
        </div>
      )}

      <WeekSchedule hours={hours} staff={staff} parity={selected} />

      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Rediger turnus
      </h2>
      <BulkTurnusForm staff={staff} weeks={weeks} />
      <StaffHoursManager hours={hours} staff={staff} weeks={weeks} />

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

      <div className="mt-10 mb-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Blokker booking
        </h2>
        <p className="mt-1 text-sm text-muted">
          Sperr hele eller deler av en dag for booking på{" "}
          <strong>alle ansatte</strong> (helligdag, arrangement, felles fri).
          Blokkerte tider forsvinner fra ledige tider i booking.
        </p>
      </div>
      <BookingBlocksManager blocks={blocks} />
    </div>
  );
}
